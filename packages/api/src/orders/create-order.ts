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

import { db } from "@virtbase/db/client";
import { orderItems, orders, orderTransitions } from "@virtbase/db/schema";
import type { OrderConfigurationSnapshot } from "@virtbase/validators";
import { encryptOrderSecret } from "./order-secrets";

export interface CreateOrderInput {
  userId: string;
  configuration: OrderConfigurationSnapshot;
  /** What the customer is charged today, in cents. */
  totalAmount: number;
  /** Plan name as it read at order time. */
  planName: string;
  /** Stripped out of the stored configuration and encrypted separately. */
  rootPassword?: string | null;
}

/**
 * Records an order before the customer is asked to pay.
 *
 * The order is created `draft` and moved to `awaiting_payment` in the same
 * transaction, so an order always has at least one transition and its history
 * never starts mid-story.
 */
export const createOrder = async ({
  userId,
  configuration,
  totalAmount,
  planName,
  rootPassword,
}: CreateOrderInput): Promise<string> => {
  // The password never goes into the readable snapshot.
  const { root_password: _omitted, ...storedConfiguration } =
    configuration as OrderConfigurationSnapshot & {
      root_password?: string | null;
    };

  const rootPasswordCiphertext = await encryptOrderSecret(rootPassword);

  return db.transaction(
    async (tx) => {
      const order = await tx
        .insert(orders)
        .values({
          userId,
          type: configuration.type,
          status: "awaiting_payment",
          totalAmount,
          currency: "EUR",
          configuration: storedConfiguration,
          rootPasswordCiphertext,
          serverId:
            "server_id" in configuration ? configuration.server_id : null,
        })
        .returning({ id: orders.id })
        .then(([row]) => row);

      if (!order) {
        throw new Error("Failed to create order.");
      }

      await tx.insert(orderItems).values({
        orderId: order.id,
        serverPlanId: configuration.server_plan_id,
        serverPlanPriceId: configuration.server_plan_price_id,
        name: planName,
        quantity: 1,
        unitAmount: totalAmount,
        // Left null: the billing country is not known until the customer pays.
        // `recordBillingDetails` fills it in when the address arrives.
      });

      // Two rows so the history reads from the beginning rather than starting
      // at whatever state the order was first observed in.
      await tx.insert(orderTransitions).values([
        { orderId: order.id, fromStatus: null, toStatus: "draft" },
        {
          orderId: order.id,
          fromStatus: "draft",
          toStatus: "awaiting_payment",
        },
      ]);

      return order.id;
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
};
