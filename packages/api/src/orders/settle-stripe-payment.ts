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
import { users } from "@virtbase/db/schema";
import { stripe } from "@virtbase/integration-stripe";
import type { Stripe } from "stripe";
import { applyPaymentEvent } from "../orders/apply-payment-event";
import { fulfilOrder } from "../orders/fulfill-order";
import { resolveOrderId } from "../orders/legacy-snapshot";

/**
 * Handles a successful Stripe payment.
 *
 * Almost all of what this used to do now lives behind `applyPaymentEvent` and
 * `fulfilOrder`, shared with Anonpay. What remains is Stripe-specific: finding
 * the customer, and reading the billing address off the charge.
 */
export const handlePaymentIntentSucceeded = async (event: Stripe.Event) => {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  // Stripe types `Metadata` as `{ [key: string]: string }` but unrecognised
  // keys come through as `string | undefined`.
  const metadata = paymentIntent.metadata as
    | Record<string, string | undefined>
    | undefined;

  const stripeCustomerId = paymentIntent.customer as string;

  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, stripeCustomerId))
    .limit(1)
    .then(([row]) => row);

  if (!user) {
    throw new Error(
      `User with Stripe customer ID not found. No actions will be taken. Stripe customer ID: ${stripeCustomerId}`,
    );
  }

  const orderId = await resolveOrderId({
    metadata,
    userId: user.id,
    amount: paymentIntent.amount,
    planName: paymentIntent.description ?? "Server plan",
  });

  const result = await applyPaymentEvent({
    eventId: event.id,
    provider: "stripe",
    type: "payment.succeeded",
    externalId: paymentIntent.id,
    orderId,
    userId: user.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency.toUpperCase(),
    occurredAt: new Date(event.created * 1000),
  });

  // A redelivered event, or one that arrived after the order had already moved
  // on. Either way there is nothing left to do.
  if (!result.shouldFulfil) return;

  const billingDetails = await readBillingDetails(paymentIntent);

  await fulfilOrder({
    orderId,
    billingDetails,
  });
};

/**
 * Stripe records the billing address on the charge rather than the intent, so
 * it has to be fetched separately.
 */
const readBillingDetails = async (paymentIntent: Stripe.PaymentIntent) => {
  const empty = {
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

  if (
    !stripe ||
    !paymentIntent.latest_charge ||
    typeof paymentIntent.latest_charge !== "string"
  ) {
    return empty;
  }

  const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
  const details = charge.billing_details;

  if (!details.address) {
    throw new Error(
      "Expected a billing address in Stripe charge. Cannot create invoice.",
    );
  }

  return {
    name: details.name,
    email: details.email,
    address: details.address,
  };
};
