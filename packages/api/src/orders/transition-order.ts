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
  /**
   * Refuse the transition unless the order is still exactly as the caller last
   * read it.
   *
   * Optimistic concurrency, for callers that decided *outside* the row lock
   * that a transition is warranted. Reconciliation is the one that needs it:
   * releasing an abandoned `fulfilling` claim is only safe if nothing has
   * touched the order since it was seen abandoned — otherwise it would tear a
   * live fulfilment out from under whoever legitimately re-claimed it, and two
   * servers would be provisioned for one payment.
   *
   * Refusal is reported as `changed: false`, not thrown: losing this race is
   * ordinary, and the next run will look again.
   */
  guard?: (order: { status: OrderStatus; updatedAt: Date }) => boolean;
}

export interface TransitionResult {
  status: OrderStatus;
  /** False when the order was already in the target status. */
  changed: boolean;
  /**
   * Whether money has been taken for this order, as of the end of the
   * transition. Distinguishes an order that failed *during fulfilment* from one
   * whose payment never succeeded — they share the `failed` status but only the
   * first may be fulfilled.
   */
  paid: boolean;
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
        .select({
          id: orders.id,
          status: orders.status,
          paidAt: orders.paidAt,
          updatedAt: orders.updatedAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1)
        .for("update")
        .then(([row]) => row);

      if (!order) {
        throw new Error(`Order ${orderId} does not exist.`);
      }

      // Checked under the lock, which is the only place it means anything.
      if (options.guard && !options.guard(order)) {
        return {
          status: order.status,
          changed: false,
          paid: order.paidAt !== null,
        };
      }

      // Self-transitions are legal for `fulfilling` (a retry), so ask the
      // machine rather than assuming sameness means no-op.
      if (!canTransitionOrder(order.status, to)) {
        if (options.idempotent) {
          return {
            status: order.status,
            changed: false,
            paid: order.paidAt !== null,
          };
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

      return {
        status: to,
        changed: true,
        paid: to === "paid" || order.paidAt !== null,
      };
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

/**
 * Atomically claims an order for fulfilment, returning whether the caller won.
 *
 * This is the gate that stops an order being fulfilled twice, and it lives here
 * rather than in `applyPaymentEvent` on purpose. The reducer used to decide by
 * asking whether *it* was the call that moved the order to `paid`, which
 * conflated two different questions: "has this order been paid for" and "is
 * anyone already fulfilling it". That conflation is why a fulfilment that threw
 * could never be retried — the money was in, the order was stranded, and every
 * redelivery declined to act because the transition had already happened.
 *
 * Deciding under the row lock separates them. Any number of deliveries may
 * conclude the order needs fulfilment; exactly one of them wins the claim.
 */
export const claimOrderForFulfilment = async (
  orderId: string,
  options: { actor?: string } = {},
): Promise<boolean> =>
  db.transaction(
    async (tx) => {
      const order = await tx
        .select({ status: orders.status, paidAt: orders.paidAt })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1)
        .for("update")
        .then(([row]) => row);

      if (!order) {
        throw new Error(`Order ${orderId} does not exist.`);
      }

      // `paid` is the ordinary case. `failed` *with* a recorded payment is a
      // fulfilment that already went wrong once — the provider is redelivering
      // and nothing else retries, so it is allowed through. `failed` without
      // `paidAt` is a payment that never succeeded and must never be fulfilled.
      // `fulfilling` is refused because someone else holds the claim.
      const claimable =
        order.status === "paid" ||
        (order.status === "failed" && order.paidAt !== null);

      if (!claimable) return false;

      await tx
        .update(orders)
        .set({ status: "fulfilling", failureReason: null })
        .where(eq(orders.id, orderId));

      await tx.insert(orderTransitions).values({
        orderId,
        fromStatus: order.status,
        toStatus: "fulfilling",
        actor: options.actor ?? "system",
      });

      return true;
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
