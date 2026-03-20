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

import { eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { serverPlans, servers, users } from "@virtbase/db/schema";
import { decryptPayload } from "@virtbase/utils";
import type { OrderConfigurationSnapshot } from "@virtbase/validators";
import type Stripe from "stripe";
import { start } from "workflow/api";
import { createInvoiceWorkflow } from "../workflows";
import { provisionServerWorkflow } from "../workflows/provision-server";
import { upgradeServerWorkflow } from "../workflows/upgrade-server";

/**
 * Handle a payment intent succeeded event from Stripe.
 *
 * At this point the payment has been successfully processed and the customer has been charged.
 *
 * This function will:
 * 1. Decrypt the configuration snapshot from the payment intent metadata
 * 2. Parse the configuration snapshot
 * 3. Check if the server plan exists
 * 4. Check if the user exists
 * 5. Create an invoice
 * 6. Start the appropriate workflow based on the configuration type
 */
export const handlePaymentIntentSucceeded = async (event: Stripe.Event) => {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const metadata = paymentIntent.metadata as
    | { configurationSnapshot?: string }
    | undefined;

  if (!metadata?.configurationSnapshot) {
    throw new Error(
      "Configuration snapshot is missing. Cannot process payment intent.",
    );
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set in the .env. Cannot decrypt configuration snapshot.",
    );
  }

  const decrypted = await decryptPayload(
    metadata.configurationSnapshot,
    stripeSecretKey,
  );
  let configuration: OrderConfigurationSnapshot;
  try {
    configuration = JSON.parse(decrypted);
  } catch {
    throw new Error(
      "Failed to parse configuration snapshot. Invalid STRIPE_SECRET_KEY or configuration snapshot is malformed.",
    );
  }

  const planId =
    configuration.type === "new_server" ||
    configuration.type === "extend_server"
      ? configuration.server_plan_id
      : configuration.new_server_plan_id;

  const [plan, user] = await db.transaction(
    async (tx) =>
      Promise.all([
        tx.$count(serverPlans, eq(serverPlans.id, planId)),
        tx.$count(
          users,
          eq(users.stripeCustomerId, paymentIntent.customer as string),
        ),
      ]),
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  if (!plan) {
    throw new Error(
      `Server plan not found. No actions will be taken. ID: ${planId}`,
    );
  }

  if (!user) {
    throw new Error(
      `User with Stripe customer ID not found. No actions will be taken. Stripe customer ID: ${paymentIntent.customer as string}`,
    );
  }

  // Currently all configuration types require an invoice to be created
  // Check if this changes with new configuration types
  await start(createInvoiceWorkflow, [
    {
      configuration,
      latestChargeId: paymentIntent.latest_charge as string,
      stripeCustomerId: paymentIntent.customer as string,
    },
  ]);

  switch (configuration.type) {
    case "new_server":
      // TODO: Start provision server workflow
      await start(provisionServerWorkflow);
      break;
    case "upgrade_server":
      // TODO: Start upgrade server workflow
      await start(upgradeServerWorkflow);
      break;
    case "extend_server": {
      const extended = await db.transaction(
        async (tx) => {
          return tx
            .update(servers)
            .set({
              // If server was previously suspended, unsuspend it
              // User is allowed to start the server again
              suspendedAt: null,
              // Add exactly one month to the termination date
              terminatesAt: sql`CASE WHEN ${servers.terminatesAt} IS NULL THEN NULL ELSE ${servers.terminatesAt} + INTERVAL '1 month' END`,
            })
            .where(eq(servers.id, configuration.server_id))
            .returning({
              id: servers.id,
            })
            .then(([row]) => row);
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );

      if (!extended || extended.id !== configuration.server_id) {
        throw new Error(
          `Failed to extend server. Server not found. ID: ${configuration.server_id}`,
        );
      }

      break;
    }
    default:
      throw new Error(
        `Unknown configuration type. Expected one of: new_server, extend_server, upgrade_server.`,
      );
  }
};
