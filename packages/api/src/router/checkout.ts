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
import { eq } from "@virtbase/db";
import { serverPlans } from "@virtbase/db/schema";
import { encryptPayload } from "@virtbase/utils";
import type { OrderConfigurationSnapshot } from "@virtbase/validators";
import {
  OrderServerPlanInputSchema,
  OrderServerPlanOutputSchema,
} from "@virtbase/validators";
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

      const planId =
        input.type === "new_server" || input.type === "extend_server"
          ? input.server_plan_id
          : input.new_server_plan_id;

      const plan = await db.transaction(
        async (tx) => {
          return tx
            .select({
              id: serverPlans.id,
              name: serverPlans.name,
              price: serverPlans.price,
            })
            .from(serverPlans)
            .where(eq(serverPlans.id, planId))
            .limit(1)
            .then(([res]) => res);
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      let configuration: OrderConfigurationSnapshot;
      switch (input.type) {
        case "new_server":
          configuration = {
            type: "new_server",
            version: 1,
            server_plan_id: plan.id,
            // TODO: Create new SSH key if not provided
            ssh_key_id: input.ssh_key_id,
            template_id: input.template_id,
            root_password: input.root_password,
          };
          break;
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
            new_server_plan_id: plan.id,
          };
          break;
        default:
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      const customerId = await getOrCreateStripeCustomer(userId);

      switch (input.type) {
      }

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
            configurationSnapshot:
              // Encrypt the configuration snapshot using AES-256-CBC encryption
              // with the stripe secret key
              await encryptPayload(
                JSON.stringify(configuration),
                stripeSecretKey,
              ),
          },
        });

        const [customerSession, paymentIntent] = await Promise.all([
          customerSessionPromise,
          paymentIntentPromise,
        ]);

        return {
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
});
