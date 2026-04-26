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
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { serverPlans, users } from "@virtbase/db/schema";
import { decryptPayload, deriveKeyHex } from "@virtbase/utils";
import type {
  CustomCheckoutInput,
  OrderConfigurationSnapshot,
} from "@virtbase/validators";
import type Stripe from "stripe";
import { start } from "workflow/api";
import type { AnonpayWebhookResponse } from "./types";

/**
 * Handle a payment finished event from Anonpay.
 *
 * At this point the payment has been successfully processed and the customer has been charged.
 *
 * This function will:
 * 1. Decrypt the configuration snapshot from the encrypted configuration snapshot
 * 2. Parse the configuration snapshot
 * 3. Check if the server plan exists
 * 4. Check if the user exists
 * 5. Create an invoice
 * 6. Start the appropriate workflow based on the configuration type
 */
export const handlePaymentFinished = async ({
  paymentIntent,
  data: _,
}: {
  paymentIntent: Stripe.PaymentIntent;
  data: AnonpayWebhookResponse;
}) => {
  const metadata = paymentIntent.metadata as
    | { configurationSnapshot?: string; billingDetailsSnapshot?: string }
    | undefined;

  if (!metadata?.configurationSnapshot || !metadata?.billingDetailsSnapshot) {
    throw new Error(
      "Configuration snapshot or billing details snapshot is missing. Cannot process payment intent.",
    );
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set in the .env. Cannot decrypt configuration and billing details snapshot.",
    );
  }

  const derivedKeyHex = await deriveKeyHex(stripeSecretKey);
  const [decryptedConfigurationSnapshot, decryptedBillingDetailsSnapshot] =
    await Promise.all([
      decryptPayload(metadata.configurationSnapshot, derivedKeyHex),
      decryptPayload(metadata.billingDetailsSnapshot, derivedKeyHex),
    ]);
  let configuration: OrderConfigurationSnapshot;
  let billingDetails: CustomCheckoutInput["billing_details"];
  try {
    configuration = JSON.parse(decryptedConfigurationSnapshot);
    billingDetails = JSON.parse(decryptedBillingDetailsSnapshot);
  } catch {
    throw new Error(
      "Failed to parse configuration snapshot or billing details snapshot. Invalid STRIPE_SECRET_KEY or snapshots are malformed.",
    );
  }

  const planId = configuration.server_plan_id;

  const [plan, user] = await db.transaction(
    async (tx) =>
      Promise.all([
        tx.$count(serverPlans, eq(serverPlans.id, planId)),
        tx
          .select({ id: users.id })
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
      billingDetails: {
        ...billingDetails,
        // AddressElement does not collect email; user.email is used in the workflow
        email: null,
      },
      stripeCustomerId: paymentIntent.customer as string,
    },
  ]);

  switch (configuration.type) {
    case "new_server":
      await start(provisionServerWorkflow, [
        {
          serverPlanId: planId,
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
