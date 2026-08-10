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

import { defineIntegration } from "@virtbase/integration-sdk";
import * as z from "zod";
import { StripePaymentProvider } from "./adapter";
import { stripe } from "./client";

export type { Stripe } from "stripe";
export * from "./adapter";
export * from "./client";
export * from "./get-or-create-customer";

const secretsSchema = z.object({
  secretKey: z.string().min(1),
  webhookSecret: z.string().min(1),
});

export default defineIntegration({
  id: "stripe",
  name: "Stripe",
  description:
    "Accepts card and SEPA payments, and hosts the payment element used at checkout.",

  category: "payments",
  icon: "stripe",
  author: "Virtbase",
  website: "https://stripe.com",
  docsUrl: "https://docs.stripe.com/payments/payment-intents",

  secrets: {
    schema: secretsSchema,
    fields: [
      {
        key: "secretKey",
        label: "Secret key",
        widget: "password",
        env: "STRIPE_SECRET_KEY",
      },
      {
        key: "webhookSecret",
        label: "Webhook signing secret",
        help: "Used to verify that webhook deliveries really came from Stripe.",
        widget: "password",
        env: "STRIPE_WEBHOOK_SECRET",
      },
    ],
  },

  provides: {
    payment: (ctx) => new StripePaymentProvider(ctx),
  },

  health: async () => {
    if (!stripe) {
      return {
        status: "error",
        checkedAt: new Date(),
        message: "STRIPE_SECRET_KEY is not set.",
      };
    }

    try {
      await stripe.balance.retrieve();
      return { status: "ok", checkedAt: new Date() };
    } catch (error) {
      return {
        status: "error",
        checkedAt: new Date(),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
