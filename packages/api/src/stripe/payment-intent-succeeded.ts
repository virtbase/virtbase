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

import {
  createInvoiceWorkflow,
  extendServerWorkflow,
  provisionServerWorkflow,
  upgradeServerWorkflow,
} from "@virtbase/api/workflows";
import { and, eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { serverPlanPrices, serverPlans, users } from "@virtbase/db/schema";
import {
  decryptPayload,
  deriveKeyHex,
  readChunkedStripeMetadata,
} from "@virtbase/utils";
import type { OrderConfigurationSnapshot } from "@virtbase/validators";
import type Stripe from "stripe";
import { start } from "workflow/api";
import { stripe } from "./client";

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
  // Stripe types `Metadata` as `{ [key: string]: string }` but in practice
  // unrecognised keys come through as `string | undefined`; the chunk
  // reader expects the looser shape.
  const metadata = paymentIntent.metadata as
    | Record<string, string | undefined>
    | undefined;

  // The snapshot is chunked across `configurationSnapshot_0..N` keys
  // because the encrypted payload overflows Stripe's 500-character
  // per-value metadata limit. `readChunkedStripeMetadata` reassembles
  // it (and transparently handles legacy single-key entries).
  const configurationSnapshot = readChunkedStripeMetadata(
    metadata,
    "configurationSnapshot",
  );

  if (!configurationSnapshot) {
    throw new Error(
      "Configuration snapshot is missing. Cannot process payment intent.",
    );
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey || !stripe) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set in the .env. Cannot decrypt configuration snapshot.",
    );
  }

  const decrypted = await decryptPayload(
    configurationSnapshot,
    await deriveKeyHex(stripeSecretKey),
  );
  let configuration: OrderConfigurationSnapshot;
  try {
    configuration = JSON.parse(decrypted);
  } catch {
    throw new Error(
      "Failed to parse configuration snapshot. Invalid STRIPE_SECRET_KEY or configuration snapshot is malformed.",
    );
  }

  const planId = configuration.server_plan_id;
  const serverPlanPriceId = configuration.server_plan_price_id;

  const [plan, price, user] = await db.transaction(
    async (tx) =>
      Promise.all([
        tx.$count(serverPlans, eq(serverPlans.id, planId)),
        tx.$count(
          serverPlanPrices,
          and(
            eq(serverPlanPrices.id, serverPlanPriceId),
            // Sanity check: the price row must belong to the plan recorded
            // in the same snapshot. Mismatch indicates a tampered or stale
            // payment intent.
            eq(serverPlanPrices.serverPlanId, planId),
          ),
        ),
        tx
          .select({
            id: users.id,
          })
          .from(users)
          .where(eq(users.stripeCustomerId, paymentIntent.customer as string))
          .limit(1)
          .then(([row]) => row),
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

  if (!price) {
    throw new Error(
      `Server plan price not found or does not belong to the recorded plan. No actions will be taken. ID: ${serverPlanPriceId}`,
    );
  }

  if (!user) {
    throw new Error(
      `User with Stripe customer ID not found. No actions will be taken. Stripe customer ID: ${paymentIntent.customer as string}`,
    );
  }

  // Currently all configuration types require an invoice to be created
  // Check if this changes with new configuration types
  if (
    paymentIntent.latest_charge &&
    typeof paymentIntent.latest_charge === "string"
  ) {
    const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
    const billingDetails = charge.billing_details;

    if (!billingDetails.address) {
      throw new Error(
        "Expected a billing address in Stripe charge. Cannot create invoice.",
      );
    }

    await start(createInvoiceWorkflow, [
      {
        configuration,
        billingDetails: {
          name: billingDetails.name,
          email: billingDetails.email,
          address: billingDetails.address,
        },
        stripeCustomerId: paymentIntent.customer as string,
      },
    ]);
  }

  switch (configuration.type) {
    case "new_server":
      await start(provisionServerWorkflow, [
        {
          serverPlanId: planId,
          serverPlanPriceId,
          userId: user.id,
          initialSSHKeyId: configuration.ssh_key_id,
          initialRootPassword: configuration.root_password,
          proxmoxTemplateId: configuration.template_id,
        },
      ]);
      break;
    case "upgrade_server":
      await start(upgradeServerWorkflow, [
        {
          serverId: configuration.server_id,
          serverPlanId: planId,
          serverPlanPriceId,
        },
      ]);
      break;
    case "extend_server": {
      await start(extendServerWorkflow, [
        {
          serverId: configuration.server_id,
        },
      ]);
      break;
    }
    default:
      throw new Error(
        `Unknown configuration type. Expected one of: new_server, extend_server, upgrade_server.`,
      );
  }
};
