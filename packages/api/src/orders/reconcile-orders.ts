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
import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNotNull,
  lt,
  sql,
} from "@virtbase/db";
import { db } from "@virtbase/db/client";
import type { OrderStatus } from "@virtbase/db/schema";
import { orders, payments } from "@virtbase/db/schema";
import { fulfilOrder } from "./fulfill-order";
import type { OrderBillingAddress } from "./record-billing-details";
import { transitionOrder } from "./transition-order";

/**
 * How long an order may sit untouched after its payment settled before
 * reconciliation treats its fulfilment as abandoned.
 *
 * `fulfilOrder` only enqueues durable workflows, so it finishes in seconds;
 * ten minutes is far longer than any legitimate run and short enough that a
 * customer who has paid is not left waiting.
 *
 * This belongs next to the other operational limits in
 * `@virtbase/utils/constants/limits`, but that file is not writable from here.
 */
export const ORDER_FULFILMENT_GRACE_MINUTES = 10;

/**
 * The maximum number of orders retried per run. Each retry enqueues two
 * workflows and may re-read a Stripe charge, so this bounds the route.
 */
export const RECONCILE_ORDERS_BATCH_SIZE = 100;

const RECONCILER_ACTOR = "system:reconcile-orders";

/**
 * Statuses a paid order can be stranded in.
 *
 * `paid` — fulfilment never started, or threw before it claimed the order.
 * `fulfilling` — it claimed the order and then the process went away.
 * `failed` — it claimed the order and threw; only retryable with `paidAt` set,
 * which is what separates it from a payment that never succeeded.
 */
const STRANDED_STATUSES = [
  "paid",
  "fulfilling",
  "failed",
] as const satisfies readonly OrderStatus[];

/** What is known about a customer before any address has been recorded. */
const EMPTY_BILLING_DETAILS: OrderBillingAddress = {
  name: null,
  email: null,
  address: {
    line1: null,
    line2: null,
    city: null,
    postal_code: null,
    country: null,
  },
};

export interface StrandedOrder {
  id: string;
  status: OrderStatus;
  updatedAt: Date;
  billingAddress: unknown;
}

/** Injected in tests, so reconciliation can be exercised without a provider. */
export type OrderBillingResolver = (
  order: StrandedOrder,
) => Promise<OrderBillingAddress>;

export interface ReconcileOrdersOptions {
  limit?: number;
  graceMinutes?: number;
  resolveBillingDetails?: OrderBillingResolver;
}

export interface ReconcileOrdersResult {
  /** Orders that looked stranded. */
  examined: number;
  /** Orders that are `fulfilled` by the time this run let go of them. */
  fulfilled: number;
  /** Orders that threw again. Each is reported to Sentry. */
  failed: number;
}

/**
 * Where a stranded order's billing address comes from.
 *
 * `recordBillingDetails` is the first thing `fulfilOrder` does, so an order
 * that got that far carries the address on the row and the retry can reuse it.
 * An order that did not is almost always a Stripe one whose charge lookup was
 * the thing that threw — so ask Stripe again, using the payment we recorded
 * rather than the spent event.
 *
 * Loaded lazily: only this branch needs the Stripe client, and reconciliation
 * should not drag it in on every run.
 */
const readRecordedBillingDetails: OrderBillingResolver = async (order) => {
  if (order.billingAddress) return order.billingAddress as OrderBillingAddress;

  const payment = await db
    .select({ provider: payments.provider, externalId: payments.externalId })
    .from(payments)
    .where(
      and(eq(payments.orderId, order.id), eq(payments.status, "succeeded")),
    )
    .limit(1)
    .then(([row]) => row);

  if (payment?.provider === "stripe") {
    const { readStripeBillingDetails } = await import(
      "./settle-stripe-payment"
    );
    return readStripeBillingDetails(payment.externalId);
  }

  // Better an invoice with no address than a customer who paid and got
  // nothing; the address is recoverable afterwards, the order is not.
  return EMPTY_BILLING_DETAILS;
};

/**
 * Re-enters every order whose payment settled but whose fulfilment did not.
 *
 * `applyPaymentEvent` claims `(provider, eventId)` before it does anything
 * else, so the provider's redelivery of that same event short-circuits — and
 * Stripe emits one `payment_intent.succeeded` per intent, so there is no
 * second event coming. Everything after the claim (recording the payment,
 * moving the order to `paid`, `fulfilOrder` itself) is therefore unprotected:
 * a charge lookup that fails, an unreachable workflow queue, a function
 * timeout or a deploy mid-request leaves the customer charged and the order
 * stranded, with nothing in the system that would ever look at it again.
 *
 * This is that something. It invents no locking of its own: `fulfilOrder`
 * still goes through `claimOrderForFulfilment`, which decides under a row
 * lock, so a reconciliation racing a late webhook — or another reconciliation
 * — still fulfils exactly once.
 */
export const reconcileOrders = async ({
  limit = RECONCILE_ORDERS_BATCH_SIZE,
  graceMinutes = ORDER_FULFILMENT_GRACE_MINUTES,
  resolveBillingDetails = readRecordedBillingDetails,
}: ReconcileOrdersOptions = {}): Promise<ReconcileOrdersResult> => {
  const grace = Math.max(0, Math.floor(graceMinutes));

  const stranded = await db
    .select({
      id: orders.id,
      status: orders.status,
      updatedAt: orders.updatedAt,
      billingAddress: orders.billingAddress,
    })
    .from(orders)
    .where(
      and(
        inArray(orders.status, [...STRANDED_STATUSES]),
        // `failed` covers both a fulfilment that threw and a card that was
        // declined. Only the first has money behind it.
        isNotNull(orders.paidAt),
        lt(
          orders.updatedAt,
          sql`now() - INTERVAL '${sql.raw(`${grace}`)} minutes'`,
        ),
        // And the money really did arrive: `paidAt` is our own bookkeeping,
        // a settled payment row is the provider's.
        exists(
          db
            .select({ one: sql`1` })
            .from(payments)
            .where(
              and(
                eq(payments.orderId, orders.id),
                eq(payments.status, "succeeded"),
              ),
            ),
        ),
      ),
    )
    // Oldest first: those are the customers who have been waiting longest.
    .orderBy(asc(orders.updatedAt))
    .limit(limit);

  const result: ReconcileOrdersResult = {
    examined: stranded.length,
    fulfilled: 0,
    failed: 0,
  };

  // Sequential on purpose: each retry enqueues workflows, and a burst of them
  // helps nobody. One bad order must not end the sweep either.
  for (const order of stranded) {
    try {
      if (order.status === "fulfilling") {
        // Nobody is holding this claim any more — the grace period is longer
        // than fulfilment can legitimately take. Release it through the state
        // machine rather than around it, so the history says what happened.
        //
        // The guard is what makes releasing a claim safe. Between the select
        // above and this transition, a late webhook or a second reconciliation
        // may have taken the order on legitimately; `updatedAt` moving is how
        // that shows. Releasing anyway would hand the same order to two
        // fulfilments and provision two servers for one payment.
        const released = await transitionOrder(order.id, "failed", {
          actor: RECONCILER_ACTOR,
          reason: "Fulfilment did not complete; retried by reconciliation.",
          idempotent: true,
          guard: (current) =>
            current.status === "fulfilling" &&
            current.updatedAt.getTime() === order.updatedAt.getTime(),
        });

        // Somebody else has it. Leave it; the next run will look again.
        if (!released.changed) continue;
      }

      await fulfilOrder({
        orderId: order.id,
        billingDetails: await resolveBillingDetails(order),
      });

      const after = await db
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, order.id))
        .limit(1)
        .then(([row]) => row);

      if (after?.status === "fulfilled") result.fulfilled++;
    } catch (error) {
      // `fulfilOrder` has already marked the order failed and recorded why;
      // the next run will try again.
      result.failed++;
      console.error(error);
      Sentry.captureException(error);
    }
  }

  return result;
};
