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
import { AnonpayPaymentProvider } from "./adapter";
import { AnonpayClient } from "./client";

export * from "./adapter";
export * from "./client";
export * from "./constants";
export * from "./types";

const settingsSchema = z.object({
  tickerTo: z.string().min(1),
  networkTo: z.string().min(1),
  address: z.string().min(1),
});

const secretsSchema = z.object({
  webhookSecret: z.string().min(1),
});

export default defineIntegration({
  id: "anonpay",
  name: "Anonpay",
  description:
    "Accepts cryptocurrency payments through Trocador's Anonpay, settled against an order.",

  category: "payments",
  icon: "anonpay",
  author: "Virtbase",
  website: "https://trocador.app",
  docsUrl: "https://trocador.app/en/anonpaydocumentation",

  settings: {
    schema: settingsSchema,
    fields: [
      {
        key: "tickerTo",
        label: "Payout ticker",
        help: "The coin payouts are received in, e.g. xmr.",
        widget: "text",
      },
      {
        key: "networkTo",
        label: "Payout network",
        help: "Network of the payout coin, e.g. Mainnet.",
        widget: "text",
      },
      {
        key: "address",
        label: "Payout address",
        widget: "text",
      },
    ],
  },

  secrets: {
    schema: secretsSchema,
    fields: [
      {
        key: "webhookSecret",
        label: "Webhook secret",
        help: "Compared against the `secret` query parameter on incoming webhooks.",
        widget: "password",
      },
    ],
  },

  provides: {
    payment: (ctx) => new AnonpayPaymentProvider(new AnonpayClient(), ctx),
  },

  health: async () => {
    // Anonpay exposes no status endpoint, so reachability is the only signal.
    try {
      const response = await fetch("https://trocador.app/anonpay/", {
        method: "HEAD",
      });
      return response.ok
        ? { status: "ok", checkedAt: new Date() }
        : {
            status: "degraded",
            checkedAt: new Date(),
            message: `Anonpay returned ${response.status}.`,
          };
    } catch (error) {
      return {
        status: "error",
        checkedAt: new Date(),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
