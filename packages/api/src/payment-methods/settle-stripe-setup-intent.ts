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

import type { Stripe } from "@virtbase/integration-stripe";
import { stripe } from "@virtbase/integration-stripe";
import {
  recordStripePaymentMethod,
  stripeCustomerIdOf,
  userIdForStripeCustomer,
} from "./settle-stripe-payment-method";

/**
 * Writes down a credential saved through the account page.
 *
 * `createSetupSession` asks Stripe for a SetupIntent and the browser confirms
 * it, but confirmation happens at Stripe - nothing in this application learns
 * the credential exists until Stripe says so here.
 *
 * **This is the smaller of the two ways a card is saved.** The main one is
 * checkout, where the card is saved off the PaymentIntent and Stripe fires
 * `payment_method.attached` and never a SetupIntent event at all - see
 * {@link handlePaymentMethodAttached}. Both end in `recordPaymentMethod`, and
 * both describe the credential the same way, so it does not matter which of
 * them gets there first.
 *
 * Deliberately tolerant of a SetupIntent that is not ours to record: a
 * `customer` we cannot resolve, an intent with no payment method attached, or
 * a credential already recorded against a different customer, all return
 * quietly rather than throwing - the last of those in
 * {@link recordStripePaymentMethod}, which both handlers share so that the two
 * cannot answer the same permanent failure differently. The route turns a
 * throw into a 500 and Stripe retries it forever, which is the right answer
 * for a transient failure and the wrong one for an event that will never be
 * recordable. A missing Stripe client, by contrast, still throws: that one is
 * a misconfiguration a later delivery may well find fixed.
 */
export const handleSetupIntentSucceeded = async (event: Stripe.Event) => {
  if (!stripe) {
    throw new Error(
      "Stripe is not configured. A setup intent cannot be recorded.",
    );
  }

  const setupIntent = event.data.object as Stripe.SetupIntent;

  const stripeCustomerId = stripeCustomerIdOf(setupIntent.customer);
  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : (setupIntent.payment_method?.id ?? null);

  if (!stripeCustomerId || !paymentMethodId) {
    // A SetupIntent created outside this flow. Nothing to attribute it to.
    console.warn(
      `[payment-methods] Setup intent ${setupIntent.id} succeeded with no customer or no payment method; ignoring.`,
    );
    return;
  }

  const userId = await userIdForStripeCustomer(stripeCustomerId);

  if (!userId) {
    // Same reasoning as the payment path, but the opposite conclusion: an
    // unattributable *payment* is money we are holding and must be shouted
    // about, whereas an unattributable saved card is inert. Retrying it until
    // Stripe gives up would bury the events that matter.
    console.warn(
      `[payment-methods] Setup intent ${setupIntent.id} names Stripe customer ${stripeCustomerId}, which belongs to no user; ignoring.`,
    );
    return;
  }

  // Unlike `payment_method.attached`, whose event object *is* the payment
  // method, a SetupIntent carries the id and not the card. Everything shown to
  // the customer - the brand, the last four, the expiry a dunning email names
  // - comes from here.
  const method = await stripe.paymentMethods.retrieve(paymentMethodId);

  await recordStripePaymentMethod(
    userId,
    method,
    `setup_intent.succeeded ${setupIntent.id}`,
  );
};
