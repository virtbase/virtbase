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
import type { OrderStatus } from "@virtbase/db/schema";
import { orders, orderTransitions } from "@virtbase/db/schema";
import { assertOrderTransition, canTransitionOrder } from "../lib/order-status";

export interface TransitionOptions {
  /** `system`, `provider:stripe`, `admin:<user id>`. */
  actor?: string;
  reason?: string;
  /**
   * Treat a transition that is not currently legal as a no-op rather than an
   * error.
   *
   * Payment providers redeliver, and out of order. An event that would move a
   * `fulfilled` order back to `paid` is a normal consequence of that, not a
   * fault — and throwing would make the provider retry the delivery forever.
   */
  idempotent?: boolean;
}

export interface TransitionResult {
  status: OrderStatus;
  /** False when the order was already in the target status. */
  changed: boolean;
}

/**
 * Moves an order to a new status, recording why.
 *
 * Runs the read and the write in one transaction with a row lock, because two
 * concurrent webhook deliveries would otherwise both read `paid` and both start
 * fulfilment.
 */
export const transitionOrder = async (
  orderId: string,
  to: OrderStatus,
  options: TransitionOptions = {},
): Promise<TransitionResult> =>
  db.transaction(
    async (tx) => {
      const order = await tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1)
        .for("update")
        .then(([row]) => row);

      if (!order) {
        throw new Error(`Order ${orderId} does not exist.`);
      }

      // Self-transitions are legal for `fulfilling` (a retry), so ask the
      // machine rather than assuming sameness means no-op.
      if (!canTransitionOrder(order.status, to)) {
        if (options.idempotent) {
          return { status: order.status, changed: false };
        }
        assertOrderTransition(order.status, to);
      }

      await tx
        .update(orders)
        .set({
          status: to,
          ...(to === "paid" && { paidAt: sql`now()` }),
          ...(to === "fulfilled" && { fulfilledAt: sql`now()` }),
          ...(options.reason && to === "failed"
            ? { failureReason: options.reason }
            : {}),
        })
        .where(eq(orders.id, orderId));

      await tx.insert(orderTransitions).values({
        orderId,
        fromStatus: order.status,
        toStatus: to,
        actor: options.actor ?? "system",
        reason: options.reason,
      });

      return { status: to, changed: true };
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
