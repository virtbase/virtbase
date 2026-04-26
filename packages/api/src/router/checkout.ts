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
import { TRPCError } from "@trpc/server";
import { and, eq } from "@virtbase/db";
import { getPlansWithAvailability } from "@virtbase/db/queries";
import { serverPlans, servers, sshKeys } from "@virtbase/db/schema";
import {
  APP_NAME,
  deriveKeyHex,
  encryptPayload,
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
import { anonpay } from "../anonpay";
import { ANONPAY_MIN_AMOUNT } from "../anonpay/constants";
import { stripe } from "../stripe";
import { getOrCreateStripeCustomer } from "../stripe/get-or-create-customer";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const checkoutRouter = createTRPCRouter({
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

      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripe || !stripeSecretKey) {
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

      if (input.type === "extend_server" || input.type === "upgrade_server") {
        const server = await db.transaction(
          async (tx) => {
            return tx
              .select({
                id: servers.id,
                installed_at: servers.installedAt,
                currentStorage: serverPlans.storage,
                currentPlanId: serverPlans.id,
              })
              .from(servers)
              .innerJoin(serverPlans, eq(servers.serverPlanId, serverPlans.id))
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
            version: 1,
            server_plan_id: plan.id,
            ssh_key_id: sshKeyId,
            template_id: input.template_id,
            root_password: input.root_password,
          };
          break;
        }
        case "extend_server":
          configuration = {
            type: "extend_server",
            version: 1,
            server_id: input.server_id,
            server_plan_id: plan.id,
          };
          break;
        case "upgrade_server":
          configuration = {
            type: "upgrade_server",
            version: 1,
            server_id: input.server_id,
            server_plan_id: plan.id,
          };
          break;
        default:
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      const customerId = await getOrCreateStripeCustomer(userId);

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
          amount: plan.price,
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
                unit_cost: plan.price,
              },
            ],
          },
          description: plan.name,
          metadata: {
            configurationSnapshot: await encryptPayload(
              JSON.stringify(configuration),
              await deriveKeyHex(stripeSecretKey),
            ),
          },
        });

        const [customerSession, paymentIntent] = await Promise.all([
          customerSessionPromise,
          paymentIntentPromise,
        ]);

        return {
          payment_intent_id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
          customer_session_client_secret: customerSession.client_secret,
        };
      } catch (error) {
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

      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripe || !stripeSecretKey) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      const [paymentIntent, customer] = await Promise.all([
        stripe.paymentIntents.retrieve(input.payment_intent_id),
        getOrCreateStripeCustomer(ctx.userId),
      ]);

      if (paymentIntent.customer !== customer) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      switch (input.type) {
        case "anonpay": {
          if (
            paymentIntent.amount < ANONPAY_MIN_AMOUNT &&
            paymentIntent.currency === "eur"
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

          // Update payment intent with encrypted billing details
          await stripe.paymentIntents.update(paymentIntent.id, {
            metadata: {
              billingDetailsSnapshot: await encryptPayload(
                JSON.stringify(input.billing_details),
                await deriveKeyHex(stripeSecretKey),
              ),
            },
          });

          const webhook = new URL(`${PUBLIC_DOMAIN}/api/anonpay/webhook`);
          webhook.searchParams.set("secret", ANONPAY_WEBHOOK_SECRET);
          webhook.searchParams.set("payment_intent_id", paymentIntent.id);

          const response = await anonpay.create({
            // Required Parameters
            ticker_to: ANONPAY_TICKER_TO,
            network_to: ANONPAY_NETWORK_TO,
            address: ANONPAY_ADDRESS,
            // Optional Parameters
            description: paymentIntent.description || undefined,
            amount: (paymentIntent.amount / 100).toFixed(2),
            fiat_equiv: paymentIntent.currency.toUpperCase(),
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
});
