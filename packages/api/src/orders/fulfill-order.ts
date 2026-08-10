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

import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { orders } from "@virtbase/db/schema";
import type { OrderConfigurationSnapshot } from "@virtbase/validators";
import { start } from "workflow/api";
import {
  createInvoiceWorkflow,
  extendServerWorkflow,
  provisionServerWorkflow,
  upgradeServerWorkflow,
} from "../workflows";
import { decryptOrderSecret } from "./order-secrets";
import { recordBillingDetails } from "./record-billing-details";
import { transitionOrder } from "./transition-order";

export interface FulfilOrderInput {
  orderId: string;
  /** Passed to invoicing; Stripe supplies it from the charge. */
  billingDetails: {
    name: string | null;
    email: string | null;
    address: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      postal_code: string | null;
      country: string | null;
    };
  };
}

/**
 * Turns a paid order into the thing the customer bought.
 *
 * One entry point for both payment providers. The Stripe and Anonpay webhook
 * handlers previously carried a copy of this each — same validation, same
 * invoice call, same three-way switch — which is how they drifted.
 */
export const fulfilOrder = async ({
  orderId,
  billingDetails,
}: FulfilOrderInput): Promise<void> => {
  const order = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      configuration: orders.configuration,
      rootPasswordCiphertext: orders.rootPasswordCiphertext,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
    .then(([row]) => row);

  if (!order) {
    throw new Error(`Order ${orderId} does not exist. Cannot fulfil.`);
  }

  const configuration = order.configuration as OrderConfigurationSnapshot;

  await transitionOrder(orderId, "fulfilling", { idempotent: true });

  // The address only becomes available once payment succeeds, so this is the
  // first moment the order can be priced for tax.
  await recordBillingDetails(orderId, billingDetails);

  try {
    // Every order type currently produces an invoice.
    await start(createInvoiceWorkflow, [
      {
        configuration,
        billingDetails,
        userId: order.userId,
      },
    ]);

    switch (configuration.type) {
      case "new_server":
        await start(provisionServerWorkflow, [
          {
            serverPlanId: configuration.server_plan_id,
            serverPlanPriceId: configuration.server_plan_price_id,
            userId: order.userId,
            initialSSHKeyId: configuration.ssh_key_id,
            // Held encrypted on the order rather than in provider metadata.
            initialRootPassword: await decryptOrderSecret(
              order.rootPasswordCiphertext,
            ),
            proxmoxTemplateId: configuration.template_id,
          },
        ]);
        break;
      case "upgrade_server":
        await start(upgradeServerWorkflow, [
          {
            serverId: configuration.server_id,
            serverPlanId: configuration.server_plan_id,
            serverPlanPriceId: configuration.server_plan_price_id,
          },
        ]);
        break;
      case "extend_server":
        await start(extendServerWorkflow, [
          { serverId: configuration.server_id },
        ]);
        break;
      default:
        throw new Error(
          "Unknown order type. Expected one of: new_server, extend_server, upgrade_server.",
        );
    }
  } catch (error) {
    await transitionOrder(orderId, "failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  // The provisioning workflows are durable and run past this point; the order
  // is "fulfilled" in the sense that everything it needed has been started.
  // Tying this to workflow completion is the next improvement here.
  await transitionOrder(orderId, "fulfilled", { idempotent: true });
};
