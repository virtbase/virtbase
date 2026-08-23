/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as Sentry from "@sentry/node";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "@virtbase/db";
import {
  getPlansWithAvailability,
  pickBestDiscount,
} from "@virtbase/db/queries";
import {
  discounts,
  discountsToServerPlans,
  orders,
  serverPlanPrices,
  serverPlans,
  servers,
  sshKeys,
} from "@virtbase/db/schema";
import {
  ANONPAY_MIN_AMOUNT,
  AnonpayClient,
} from "@virtbase/integration-anonpay";
import {
  getOrCreateStripeCustomer,
  stripe,
} from "@virtbase/integration-stripe";
import {
  APP_NAME,
  isInstalling,
  PUBLIC_DOMAIN,
  parsePublicKey,
  SUPPORT_EMAIL,
} from "@virtbase/utils";
import type { OrderConfigurationSnapshot } from "@virtbase/validators";
import {
  CustomCheckoutInputSchema,
  CustomCheckoutOutputSchema,
  OrderServerPlanInputSchema,
  OrderServerPlanOutputSchema,
} from "@virtbase/validators";
import { calculateProRataUpgrade } from "../lib/pricing";
import { createOrder, recordBillingDetails } from "../orders";
import { protectedProcedure } from "../trpc";

// Pro-rata math reference period. We bill against a flat 30-day month so
// the upgrade charge is stable regardless of which calendar month the
// upgrade lands in (Postgres `INTERVAL '1 month'` is variable length).

export const checkoutRouter = {
  order: protectedProcedure
    .meta({
      ratelimit: {
        requests: 8,
        seconds: "1 m",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `order:${userId || defaultFingerprint}`,
      },
    })
    .input(OrderServerPlanInputSchema)
    .output(OrderServerPlanOutputSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.apiKey) {
        // Additional security layer to block API key users from creating checkout sessions
        // Should be handled by middleware but just in case
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (!stripe) {
        // Stripe is not configured
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      const { db, userId } = ctx;

      const planId = input.server_plan_id;

      const plan = await getPlansWithAvailability(eq(serverPlans.id, planId))
        .limit(1)
        .execute()
        .then(([res]) => res);

      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // For `upgrade_server`, pro-rata depends on the customer's current
      // locked renewal price and how much of their term is still remaining.
      // Capture the current row up-front (alongside the existing auth and
      // sanity checks) so we can use it when constructing the new price row
      // and the charge below.
      let upgradeContext: {
        currentRenewalPrice: number;
        terminatesAt: Date | null;
      } | null = null;

      if (input.type === "extend_server" || input.type === "upgrade_server") {
        const server = await db.transaction(
          async (tx) => {
            return tx
              .select({
                id: servers.id,
                installed_at: servers.installedAt,
                currentStorage: serverPlans.storage,
                currentPlanId: serverPlans.id,
                currentRenewalPrice: serverPlanPrices.renewalPrice,
                terminatesAt: servers.terminatesAt,
              })
              .from(servers)
              .innerJoin(serverPlans, eq(servers.serverPlanId, serverPlans.id))
              .innerJoin(
                serverPlanPrices,
                eq(servers.serverPlanPriceId, serverPlanPrices.id),
              )
              .where(
                and(
                  eq(servers.id, input.server_id),
                  // [!] Authorization: Only allow the user to extend or upgrade their own server
                  eq(servers.userId, userId),
                ),
              )
              .limit(1)
              .then(([res]) => res);
          },
          {
            accessMode: "read only",
            isolationLevel: "read committed",
          },
        );

        if (!server) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        if (input.type === "upgrade_server") {
          if (
            // Cannot upgrade an installing server
            isInstalling(server) ||
            // Downgrading to a smaller storage plan is not supported
            server.currentStorage > plan.storage ||
            // Cannot upgrade to the same plan
            server.currentPlanId === plan.id
          ) {
            throw new TRPCError({ code: "BAD_REQUEST" });
          }

          upgradeContext = {
            currentRenewalPrice: server.currentRenewalPrice,
            terminatesAt: server.terminatesAt,
          };
        }

        // Upgrades are constrained to the server's existing node, so the
        // cross-node availability flag from `getPlansWithAvailability` does
        // not apply here. A node-local capacity check belongs in the upgrade
        // workflow itself before the resize is attempted.
        // Extensions reuse the resources already reserved for the server, so
        // they don't need an availability check either.
      } else if (!plan.isAvailable) {
        // No node in the plan's group currently has capacity for a fresh
        // server of this plan; refuse the order before charging the customer.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The selected plan is currently sold out.",
        });
      }

      // Resolve the `server_plan_prices` row for this order.
      //
      // - `new_server` and `upgrade_server` create a fresh row that locks in
      //   the best applicable discount for both purchase and renewal at
      //   order-time. The created row's id is encoded into the snapshot so
      //   the workflow can attach it to the server.
      // - `extend_server` reuses the server's existing price row so the
      //   customer keeps any custom/discounted pricing carried since the
      //   original purchase.
      let serverPlanPriceId: string;
      let chargedAmount: number;
      let createdPriceId: string | null = null;
      // Pro-rata charge for `upgrade_server`; null otherwise. Threaded
      // through the snapshot so invoice generation can render the actual
      // amount that was charged today (which is less than the full plan
      // price because we keep the existing term length intact).
      let upgradeCharge: number | null = null;
      if (input.type === "extend_server") {
        const existing = await db.transaction(
          async (tx) => {
            return tx
              .select({
                id: serverPlanPrices.id,
                renewalPrice: serverPlanPrices.renewalPrice,
              })
              .from(servers)
              .innerJoin(
                serverPlanPrices,
                eq(servers.serverPlanPriceId, serverPlanPrices.id),
              )
              .where(
                and(
                  eq(servers.id, input.server_id),
                  // Re-check ownership for defense in depth
                  eq(servers.userId, userId),
                ),
              )
              .limit(1)
              .then(([res]) => res);
          },
          {
            accessMode: "read only",
            isolationLevel: "read committed",
          },
        );

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        serverPlanPriceId = existing.id;
        chargedAmount = existing.renewalPrice;
      } else {
        // `new_server` or `upgrade_server`: evaluate discounts and create
        // a new price row that snapshots the result.
        const result = await db.transaction(
          async (tx) => {
            const activeDiscounts = await tx
              .select({
                id: discounts.id,
                type: discounts.type,
                amount: discounts.amount,
                appliesTo: discounts.appliesTo,
              })
              .from(discounts)
              .innerJoin(
                discountsToServerPlans,
                eq(discountsToServerPlans.discountId, discounts.id),
              )
              .where(
                and(
                  eq(discountsToServerPlans.serverPlanId, plan.id),
                  eq(discounts.active, true),
                  sql`${discounts.startsAt} IS NULL OR ${discounts.startsAt} <= now()`,
                  sql`${discounts.endsAt} IS NULL OR ${discounts.endsAt} >= now()`,
                ),
              );

            const { discount: purchaseDiscount, finalPrice: purchasePrice } =
              pickBestDiscount(plan.price, activeDiscounts, "purchase");
            const { discount: renewalDiscount, finalPrice: renewalPrice } =
              pickBestDiscount(plan.price, activeDiscounts, "renewal");

            const inserted = await tx
              .insert(serverPlanPrices)
              .values({
                serverPlanId: plan.id,
                purchasePrice,
                renewalPrice,
                purchaseDiscountId: purchaseDiscount?.id ?? null,
                renewalDiscountId: renewalDiscount?.id ?? null,
              })
              .returning({
                id: serverPlanPrices.id,
                purchasePrice: serverPlanPrices.purchasePrice,
                renewalPrice: serverPlanPrices.renewalPrice,
              })
              .then(([row]) => row);

            if (!inserted) {
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
            }

            return inserted;
          },
          {
            accessMode: "read write",
            isolationLevel: "read committed",
          },
        );

        serverPlanPriceId = result.id;
        createdPriceId = result.id;

        if (input.type === "upgrade_server" && upgradeContext) {
          const quote = calculateProRataUpgrade({
            currentRenewalPrice: upgradeContext.currentRenewalPrice,
            newRenewalPrice: result.renewalPrice,
            terminatesAt: upgradeContext.terminatesAt,
          });

          // If the term has lapsed (or the new plan isn't more expensive)
          // there's nothing to charge; the customer should renew first
          // rather than upgrade through an empty PaymentIntent that
          // Stripe would reject.
          if (!quote.chargeable) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Your current term has expired or the upgrade does not require an additional charge. Please renew your server before upgrading.",
            });
          }

          upgradeCharge = quote.amount;
          chargedAmount = upgradeCharge;
        } else {
          chargedAmount = result.purchasePrice;
        }
      }

      let configuration: OrderConfigurationSnapshot;
      switch (input.type) {
        case "new_server": {
          let sshKeyId = input.ssh_key_id;
          if (!sshKeyId && input.new_ssh_key) {
            try {
              // This bypasses the limit defined in MAX_SSH_KEYS_PER_USER
              // which is okay but should be handled by the client

              const parsed = await parsePublicKey(input.new_ssh_key);
              sshKeyId = await db.transaction(
                async (tx) => {
                  const inserted = await tx
                    .insert(sshKeys)
                    .values({
                      userId,
                      name: "SSH Key",
                      publicKey: parsed.sanitzedKey,
                      fingerprint: parsed.fingerprint,
                    })
                    .returning({ id: sshKeys.id })
                    .execute()
                    .then(([row]) => row);

                  return inserted?.id ?? null;
                },
                {
                  accessMode: "read write",
                  isolationLevel: "read committed",
                },
              );
            } catch {
              // ignored
            }
          }

          configuration = {
            type: "new_server",
            version: 2,
            server_plan_id: plan.id,
            server_plan_price_id: serverPlanPriceId,
            ssh_key_id: sshKeyId,
            template_id: input.template_id,
            root_password: input.root_password,
          };
          break;
        }
        case "extend_server":
          configuration = {
            type: "extend_server",
            version: 2,
            server_id: input.server_id,
            server_plan_id: plan.id,
            server_plan_price_id: serverPlanPriceId,
          };
          break;
        case "upgrade_server":
          if (upgradeCharge === null) {
            // Defensive: pro-rata branch above must have populated this
            // for any `upgrade_server` order. Bail out rather than silently
            // omitting the field from the snapshot.
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          }
          configuration = {
            type: "upgrade_server",
            version: 2,
            server_id: input.server_id,
            server_plan_id: plan.id,
            server_plan_price_id: serverPlanPriceId,
            upgrade_charge: upgradeCharge,
          };
          break;
        default:
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      const customerId = await getOrCreateStripeCustomer(userId);

      // The order is the record of what was bought. The payment intent points
      // at it by id; the encrypted snapshot below is the legacy carrier and is
      // written alongside until every in-flight payment predating orders has
      // settled (finding F9).
      const orderId = await createOrder({
        userId,
        configuration,
        totalAmount: chargedAmount,
        planName: plan.name,
        rootPassword:
          "root_password" in configuration ? configuration.root_password : null,
      });

      try {
        const customerSessionPromise = stripe.customerSessions.create({
          customer: customerId,
          components: {
            payment_element: {
              enabled: true,
              features: {
                payment_method_redisplay: "enabled",
                payment_method_allow_redisplay_filters: [
                  "always",
                  "limited",
                  "unspecified",
                ],
                payment_method_save: "enabled",
                payment_method_save_usage: "off_session",
                payment_method_remove: "enabled",
              },
            },
          },
        });

        const paymentIntentPromise = stripe.paymentIntents.create({
          amount: chargedAmount,
          customer: customerId,
          automatic_payment_methods: {
            enabled: true,
          },
          currency: "eur",
          amount_details: {
            line_items: [
              {
                product_name: plan.name,
                quantity: 1,
                unit_cost: chargedAmount,
              },
            ],
          },
          description: plan.name,
          // The order is the record of what was bought; the intent only points
          // at it. This used to also carry the whole configuration, encrypted
          // and chunked across several metadata keys because the ciphertext
          // overshot Stripe's 500-character per-value cap, under a key derived
          // from `STRIPE_SECRET_KEY` — which meant rotating a payment
          // credential made in-flight orders unreadable. `resolveOrderId` still
          // reads that shape for intents created before the order table, and
          // goes away with them.
          metadata: { orderId },
        });

        const [customerSession, paymentIntent] = await Promise.all([
          customerSessionPromise,
          paymentIntentPromise,
        ]);

        return {
          order_id: orderId,
          payment_intent_id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
          customer_session_client_secret: customerSession.client_secret,
        };
      } catch (error) {
        // If we created a fresh price row for this order, undo it so we
        // don't accumulate orphan rows from failed Stripe calls.
        if (createdPriceId) {
          try {
            await db.transaction(
              async (tx) => {
                await tx
                  .delete(serverPlanPrices)
                  .where(eq(serverPlanPrices.id, createdPriceId));
              },
              {
                accessMode: "read write",
                isolationLevel: "read committed",
              },
            );
          } catch (rollbackError) {
            Sentry.captureException(rollbackError, {
              tags: {
                "checkout.rollback": "true",
              },
            });
          }
        }

        Sentry.captureException(error, {
          tags: {
            "stripe.error": "true",
          },
        });

        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),
  customCheckout: protectedProcedure
    .meta({
      ratelimit: {
        requests: 8,
        seconds: "1 m",
        fingerprint: ({ userId, defaultFingerprint }) =>
          `custom-checkout:${userId || defaultFingerprint}`,
      },
    })
    .input(CustomCheckoutInputSchema)
    .output(CustomCheckoutOutputSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.apiKey) {
        // Additional security layer to block API key users from creating checkout sessions
        // Should be handled by middleware but just in case
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const order = await ctx.db
        .select({
          id: orders.id,
          userId: orders.userId,
          totalAmount: orders.totalAmount,
          currency: orders.currency,
          status: orders.status,
        })
        .from(orders)
        .where(eq(orders.id, input.order_id))
        .limit(1)
        .then(([row]) => row);

      // [!] Authorization: an order may only be paid for by the user who placed it
      if (!order || order.userId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (order.status !== "awaiting_payment") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This order is no longer awaiting payment.",
        });
      }

      switch (input.type) {
        case "anonpay": {
          if (
            order.totalAmount < ANONPAY_MIN_AMOUNT &&
            order.currency === "EUR"
          ) {
            throw new TRPCError({ code: "BAD_REQUEST" });
          }

          const {
            ANONPAY_TICKER_TO,
            ANONPAY_NETWORK_TO,
            ANONPAY_ADDRESS,
            ANONPAY_WEBHOOK_SECRET,
          } = process.env;
          if (
            !ANONPAY_TICKER_TO ||
            !ANONPAY_NETWORK_TO ||
            !ANONPAY_ADDRESS ||
            !ANONPAY_WEBHOOK_SECRET
          ) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          }

          // The address goes on the order rather than through provider
          // metadata. Anonpay collects it before payment, unlike Stripe.
          await recordBillingDetails(order.id, {
            ...input.billing_details,
            email: null,
          });

          const webhook = new URL(`${PUBLIC_DOMAIN}/api/anonpay/webhook`);
          webhook.searchParams.set("secret", ANONPAY_WEBHOOK_SECRET);
          webhook.searchParams.set("order_id", order.id);

          const response = await new AnonpayClient().create({
            // Required Parameters
            ticker_to: ANONPAY_TICKER_TO,
            network_to: ANONPAY_NETWORK_TO,
            address: ANONPAY_ADDRESS,
            // Optional Parameters
            description: `${APP_NAME} order ${order.id}`,
            amount: (order.totalAmount / 100).toFixed(2),
            fiat_equiv: order.currency,
            direct: false,
            email: SUPPORT_EMAIL,
            donation: false,
            remove_direct_pay: true,
            simple_mode: true,
            bgcolor: "0a0a0aff",
            buttonbgcolor: "ffffff",
            textcolor: "000000",
            name: APP_NAME,
            webhook: webhook.toString(),
          });

          return {
            redirect_url: response.url,
          };
        }
        default:
          throw new TRPCError({ code: "BAD_REQUEST" });
      }
    }),
} satisfies TRPCRouterRecord;
