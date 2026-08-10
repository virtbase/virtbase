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
import type { AnonpayWebhookResponse } from "@virtbase/integration-anonpay";
import { applyPaymentEvent } from "../orders/apply-payment-event";
import { fulfilOrder } from "../orders/fulfill-order";
import type { OrderBillingAddress } from "../orders/record-billing-details";

/**
 * Handles a finished Anonpay payment.
 *
 * Anonpay settles against an order, not against a Stripe payment intent. It
 * used to run on Stripe's rails — retrieving the intent, minting a custom
 * payment method, and reporting the crypto payment back into Stripe as the
 * ledger of record — which made it a payment method layered on another provider
 * rather than a provider in its own right.
 */
export const handlePaymentFinished = async ({
  orderId,
  data,
}: {
  orderId: string;
  data: AnonpayWebhookResponse;
}) => {
  const order = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      totalAmount: orders.totalAmount,
      currency: orders.currency,
      billingAddress: orders.billingAddress,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
    .then(([row]) => row);

  if (!order) {
    throw new Error(`Order ${orderId} does not exist. Cannot settle payment.`);
  }

  const result = await applyPaymentEvent({
    // Anonpay sends no event id, so its trade id is the idempotency key: one
    // trade settles once, however many times the webhook is delivered.
    eventId: data.trade_id,
    provider: "anonpay",
    type: "payment.succeeded",
    externalId: data.trade_id,
    orderId: order.id,
    userId: order.userId,
    amount: order.totalAmount,
    currency: order.currency,
    occurredAt: new Date(data.date),
  });

  if (!result.shouldFulfil) return;

  await fulfilOrder({
    orderId: order.id,
    // Collected by our own form before payment and stored on the order.
    billingDetails: order.billingAddress as OrderBillingAddress,
  });
};
