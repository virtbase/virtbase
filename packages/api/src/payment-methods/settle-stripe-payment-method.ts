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
import { and, eq, isNull } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { paymentMethods, users } from "@virtbase/db/schema";
import type { Stripe } from "@virtbase/integration-stripe";
import {
  PaymentMethodOwnershipConflictError,
  recordPaymentMethod,
} from "./record";

/**
 * Display material for a saved credential, whatever kind it is.
 *
 * Only the fields `payment_methods` has a column for. A Stripe PaymentMethod
 * carries a great deal more - a billing address, a fingerprint, the issuing
 * country - and none of it belongs in a table this application reads on every
 * renewal.
 *
 * Shared by every path that writes one of these rows: the two webhook
 * handlers below, the setup-intent handler next door, and the backfill. A
 * card described one way by the webhook and another way by the backfill would
 * show the customer two different cards depending on which arrived first.
 */
export const describeStripePaymentMethod = (method: Stripe.PaymentMethod) => {
  if (method.type === "card" && method.card) {
    return {
      brand: method.card.brand,
      last4: method.card.last4,
      expMonth: method.card.exp_month,
      expYear: method.card.exp_year,
    };
  }

  if (method.type === "sepa_debit" && method.sepa_debit) {
    // A mandate has no expiry. Leaving the columns null is what lets the
    // dunning mail say "your card expired" only when a card actually did.
    return {
      brand: method.sepa_debit.bank_code ?? null,
      last4: method.sepa_debit.last4 ?? null,
      expMonth: null,
      expYear: null,
    };
  }

  return { brand: null, last4: null, expMonth: null, expYear: null };
};

/**
 * The customer id out of a field Stripe may have expanded.
 *
 * Every object in these events names its customer as an id, but the same
 * shapes come back expanded from a retrieve, and a `DeletedCustomer` is a
 * third shape again. Reading `.id` off whatever is there is cheaper than
 * pinning down which call produced it.
 */
export const stripeCustomerIdOf = (
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null => {
  if (!customer) return null;

  return typeof customer === "string" ? customer : customer.id;
};

/**
 * The user a Stripe customer belongs to, or null.
 *
 * Null is a normal answer, not a failure: the same Stripe account serves test
 * fixtures, a colleague's local database and anything created by hand in the
 * dashboard, and none of those have a user here.
 */
export const userIdForStripeCustomer = async (
  stripeCustomerId: string,
): Promise<string | null> =>
  db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, stripeCustomerId))
    .limit(1)
    .then(([row]) => row?.id ?? null);

/**
 * Writes a credential down, and decides what a failure to do so means.
 *
 * Both Stripe handlers end here, and both are reached from the webhook route,
 * which turns a throw into a 500 and lets Stripe redeliver. That is the right
 * answer for a failure that a later attempt could get past - the database was
 * unreachable, a deadlock was chosen as the victim - and it is the wrong one
 * for a failure that is settled: Stripe redelivers on its full backoff for
 * days, spends a Sentry event on every delivery, and walks the endpoint toward
 * the automatic-disable threshold. **A disabled endpoint is the real cost.**
 * It also carries `payment_intent.succeeded`, which every renewal settlement
 * and every order fulfilment depends on, so one unrecordable card would
 * silently take the whole of billing with it.
 *
 * `PaymentMethodOwnershipConflictError` is the settled kind.
 * `(provider, external_id)` already belongs to a different user, and no number
 * of retries changes whose row it is - the credential would have to be moved
 * between customers, which `recordPaymentMethod` refuses on purpose. So it is
 * swallowed, and Stripe stops.
 *
 * Swallowed is not ignored. It should be unreachable - a Stripe payment method
 * belongs to one Stripe customer, and a Stripe customer to one user here - so
 * reaching it means either two users share a `stripe_customer_id` or a row was
 * written by hand. That is worth waking up to, which is why it is reported once,
 * as an error, rather than a hundred times as a 500.
 *
 * Everything else is rethrown untouched, and Stripe retries it.
 */
export const recordStripePaymentMethod = async (
  userId: string,
  method: Stripe.PaymentMethod,
  /** How this credential reached us, for the log line: the event and its id. */
  arrival: string,
): Promise<void> => {
  try {
    await recordPaymentMethod({
      db,
      userId,
      provider: "stripe",
      externalId: method.id,
      type: method.type,
      ...describeStripePaymentMethod(method),
    });
  } catch (error) {
    if (!(error instanceof PaymentMethodOwnershipConflictError)) {
      // Transient until proven otherwise. Retrying a failure that turns out to
      // be permanent costs deliveries; swallowing one that was transient loses
      // a customer's saved card silently, and they find out at a renewal.
      throw error;
    }

    console.error(
      `[payment-methods] Stripe payment method ${method.id} (${arrival}) is already recorded against a customer other than ${userId}. Refusing to move it, and not asking Stripe to try again - no retry can make this recordable. Investigate by hand: this should not be reachable.`,
    );

    Sentry.captureException(error, {
      level: "error",
      tags: { domain: "payment-methods", provider: "stripe" },
      extra: { stripePaymentMethodId: method.id, userId, arrival },
    });
  }
};

/**
 * Writes down a credential a customer has saved at Stripe.
 *
 * **This, not `setup_intent.succeeded`, is the main path.** Checkout asks for
 * a Customer Session with `payment_method_save: "enabled"`, so a customer who
 * ticks "save this card" saves it off the PaymentIntent - Stripe attaches the
 * method to the customer and fires this, and no SetupIntent is ever created.
 * The account page's "add a payment method" is the *other*, smaller path, and
 * it was the only one being listened to.
 *
 * A card that is merely *used* at checkout is never attached, so this event
 * means the customer opted in rather than merely paid. There is nothing here
 * that turns automatic renewal on: recording the credential is what makes the
 * opt-in offerable at all, and the opt-in stays a separate, explicit act.
 *
 * **The event object is the PaymentMethod**, so `customer` and the display
 * fields are already here and there is no second API call to make. Which also
 * means this handler needs no Stripe client and works when one is not
 * configured.
 *
 * Deliberately tolerant, like the setup-intent handler: a `customer` we cannot
 * resolve returns quietly, and so does a credential that is already recorded
 * against somebody else - see {@link recordStripePaymentMethod}. The route
 * turns a throw into a 500 and Stripe retries it forever, which is right for a
 * transient failure and wrong for an event that will never be recordable.
 * Every other failure still throws, and is still retried.
 */
export const handlePaymentMethodAttached = async (event: Stripe.Event) => {
  const method = event.data.object as Stripe.PaymentMethod;

  const stripeCustomerId = stripeCustomerIdOf(method.customer);

  if (!stripeCustomerId) {
    // An attach with no customer is not a thing Stripe sends; if it ever
    // arrives there is nothing to attribute it to.
    console.warn(
      `[payment-methods] Payment method ${method.id} was attached to no customer; ignoring.`,
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
      `[payment-methods] Payment method ${method.id} names Stripe customer ${stripeCustomerId}, which belongs to no user; ignoring.`,
    );
    return;
  }

  await recordStripePaymentMethod(
    userId,
    method,
    `payment_method.attached, Stripe customer ${stripeCustomerId}`,
  );
};

/**
 * Marks a credential removed somewhere other than here.
 *
 * `removePaymentMethod` detaches at Stripe and then soft-deletes locally, so
 * the customer's own "remove" needs nothing from this handler - it arrives as
 * a redelivery of a state we already hold. What it is for is every other way a
 * credential goes away: an operator in the Stripe dashboard, Stripe detaching
 * the methods of a deleted customer, a card the issuer withdrew. Without it
 * such a row stays live here, keeps being offered as the renewal default, and
 * every off-session charge against it fails with `resource_missing` - a
 * customer walked down the dunning ladder over a token that could never have
 * worked.
 *
 * **Attribution is by `(provider, external_id)`, not by customer**, because
 * Stripe clears `customer` on the object it sends with this event. That is
 * also why the write is scoped to a row we already have: an id we have never
 * seen is not ours and is ignored.
 *
 * The row is soft-deleted, exactly as `removePaymentMethod` does it, and
 * `is_default` goes with it - a detached row that kept the flag would collide
 * with the next default when `recordPaymentMethod` re-attaches the same card.
 *
 * Nothing is done to `subscriptions.payment_method_id`:
 * `resolveRenewalPaymentMethod` already falls through from a detached named
 * credential to the customer's default, which is what a customer with another
 * live card plainly meant to happen.
 */
export const handlePaymentMethodDetached = async (event: Stripe.Event) => {
  const method = event.data.object as Stripe.PaymentMethod;

  // A credential we never recorded, or one already removed, matches nothing
  // and writes nothing. Both are ordinary, and neither is worth a retry.
  await db.transaction(
    async (tx) =>
      tx
        .update(paymentMethods)
        .set({ detachedAt: new Date(), isDefault: false })
        .where(
          and(
            eq(paymentMethods.provider, "stripe"),
            eq(paymentMethods.externalId, method.id),
            // Already detached: a redelivery, or our own `removePaymentMethod`
            // having done it first. Leaving `detached_at` at the moment it
            // actually happened is more truthful than restamping it.
            isNull(paymentMethods.detachedAt),
          ),
        )
        .returning({ id: paymentMethods.id }),
    { accessMode: "read write", isolationLevel: "read committed" },
  );
};
