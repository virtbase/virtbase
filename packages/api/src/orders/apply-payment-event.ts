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

import { and, eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { orders, paymentEvents, payments } from "@virtbase/db/schema";
import { transitionOrder } from "./transition-order";

export type NormalisedPaymentEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.refunded";

export interface NormalisedPaymentEvent {
  /** The provider's event id — not the payment id. */
  eventId: string;
  /** Integration id: `stripe`, `anonpay`. */
  provider: string;
  type: NormalisedPaymentEventType;
  /** The provider's id for the payment itself. */
  externalId: string;
  orderId: string;
  userId: string;
  amount: number;
  currency?: string;
  /** `card`, `sepa_debit`, `xmr`, … */
  method?: string | null;
  occurredAt?: Date;
  failureReason?: string | null;
}

export interface ApplyPaymentEventResult {
  /** False when this event had already been applied. */
  applied: boolean;
  orderId: string;
  /** Whether the caller should now run fulfilment. */
  shouldFulfil: boolean;
}

const ORDER_STATUS_FOR = {
  "payment.succeeded": "paid",
  "payment.failed": "failed",
  "payment.refunded": "refunded",
} as const;

const PAYMENT_STATUS_FOR = {
  "payment.succeeded": "succeeded",
  "payment.failed": "failed",
  "payment.refunded": "refunded",
} as const;

/**
 * The single reducer every payment provider webhook funnels into.
 *
 * Stripe and Anonpay used to be two near-identical handlers, neither of which
 * checked whether it had seen an event before. Both providers retry, so a
 * redelivery would provision a second server. Recording `(provider, eventId)`
 * under a unique constraint before doing anything else is what makes that
 * impossible: the second attempt loses the insert race and returns early.
 */
export const applyPaymentEvent = async (
  event: NormalisedPaymentEvent,
): Promise<ApplyPaymentEventResult> => {
  // Validate the order before claiming, so an event naming an order that does
  // not exist reports that rather than surfacing a foreign key violation.
  const order = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(eq(orders.id, event.orderId))
    .limit(1)
    .then(([row]) => row);

  if (!order) {
    throw new Error(
      `Payment event ${event.eventId} refers to order ${event.orderId}, which does not exist.`,
    );
  }

  // Claim the event. If another delivery already claimed it, stop: this is the
  // atomic gate that makes concurrent deliveries safe.
  const claim = await db
    .insert(paymentEvents)
    .values({
      provider: event.provider,
      eventId: event.eventId,
      orderId: event.orderId,
      type: event.type,
      occurredAt: event.occurredAt ?? new Date(),
    })
    .onConflictDoNothing({
      target: [paymentEvents.provider, paymentEvents.eventId],
    })
    .returning({ id: paymentEvents.id })
    .then(([row]) => row);

  if (!claim) {
    return { applied: false, orderId: event.orderId, shouldFulfil: false };
  }

  const succeeded = event.type === "payment.succeeded";

  const payment = await db
    .insert(payments)
    .values({
      orderId: event.orderId,
      userId: event.userId,
      provider: event.provider,
      externalId: event.externalId,
      status: PAYMENT_STATUS_FOR[event.type],
      amount: event.amount,
      capturedAmount: succeeded ? event.amount : 0,
      refundedAmount: event.type === "payment.refunded" ? event.amount : 0,
      currency: event.currency ?? "EUR",
      method: event.method ?? null,
      failureReason: event.failureReason ?? null,
    })
    .onConflictDoUpdate({
      target: [payments.provider, payments.externalId],
      set: {
        status: PAYMENT_STATUS_FOR[event.type],
        capturedAmount: succeeded ? event.amount : 0,
        refundedAmount: event.type === "payment.refunded" ? event.amount : 0,
        method: event.method ?? null,
        failureReason: event.failureReason ?? null,
      },
    })
    .returning({ id: payments.id })
    .then(([row]) => row);

  if (payment) {
    await db
      .update(paymentEvents)
      .set({ paymentId: payment.id })
      .where(
        and(
          eq(paymentEvents.provider, event.provider),
          eq(paymentEvents.eventId, event.eventId),
        ),
      );
  }

  const target = ORDER_STATUS_FOR[event.type];

  // An order that is already fulfilled must not be dragged back to `paid` by a
  // late redelivery, so the transition is allowed to be a no-op.
  const transition = await transitionOrder(event.orderId, target, {
    actor: `provider:${event.provider}`,
    reason: event.failureReason ?? undefined,
    idempotent: true,
  });

  return {
    applied: true,
    orderId: event.orderId,
    // Reports whether the order *needs* fulfilment, not whether this call was
    // the one that moved it. Fulfilment runs after the event has been claimed,
    // so anything throwing in between — a charge fetch, the workflow queue —
    // leaves a paid order unfulfilled; keying this on `transition.changed`
    // turned the provider's retry into a no-op and stranded the order for good,
    // because nothing else retries. `claimOrderForFulfilment` is what keeps
    // concurrent deliveries from acting on this answer twice.
    shouldFulfil:
      succeeded &&
      (transition.status === "paid" ||
        (transition.status === "failed" && transition.paid)),
  };
};
