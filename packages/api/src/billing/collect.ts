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

import { and, desc, eq, isNull } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import type { SubscriptionRenewal } from "@virtbase/db/schema";
import { orderItems, paymentMethods, subscriptions } from "@virtbase/db/schema";
import type { OffSessionResult } from "@virtbase/ports";
import { requirePaymentCapability } from "../payment-methods/provider";

/**
 * The credential a renewal is charged against.
 *
 * `provider` and `externalId` are on it because the charge cannot be made
 * without them, and this is one of the two modules in the application that may
 * read them - `payment-methods/list.ts` documents why they never leave the
 * server. Nothing here is ever returned to a router.
 */
export interface RenewalPaymentMethod {
  id: string;
  /** Integration id of the provider holding the credential: `stripe`. */
  provider: string;
  /** The provider's label for the instrument, which is `payments.method`. */
  type: string;
  /** The provider's own token, which is what an off-session charge names. */
  externalId: string;
  brand: string | null;
  /** For the dunning email and the collector's log line. Never a pan. */
  last4: string | null;
  /** Set once the provider told us this credential is dead. */
  invalidAt: Date | null;
}

/** The renewal columns a collection needs. */
export type CollectableRenewal = Pick<
  SubscriptionRenewal,
  "id" | "subscriptionId" | "amount" | "currency" | "attempt" | "orderId"
>;

/**
 * The failure code for a customer with nothing to charge.
 *
 * Retryable, and deliberately so. Nothing was declined - there is simply no
 * card on file - and the dunning ladder is exactly the window in which a
 * customer adds one. Marking it terminal would mean a customer who saves a
 * card the same afternoon is never charged again and loses the server anyway.
 */
export const NO_PAYMENT_METHOD_CODE = "no_payment_method";

/**
 * The failure code for a credential we already know is dead.
 *
 * Also retryable: `invalid_at` is set on one credential, and a customer whose
 * card expired can add another before the ladder runs out.
 */
export const PAYMENT_METHOD_INVALID_CODE = "payment_method_invalid";

/** What the customer sees on their statement when a plan name is unavailable. */
const FALLBACK_DESCRIPTION = "Subscription renewal";

/**
 * The idempotency key for one attempt at one renewal.
 *
 * **The attempt number has to be in the key.** The two things it separates
 * pull in opposite directions: a crash-retry of the same attempt must return
 * the charge the provider already made, so a lost response cannot bill twice;
 * a deliberate next rung of the dunning ladder must make a *new* charge, so a
 * card that has since been topped up is actually presented again. A key
 * without the attempt collapses the second into the first and the ladder
 * silently replays one dead charge four times; a key with a timestamp in it
 * collapses the first into the second and bills the customer once per crash.
 */
export const renewalIdempotencyKey = (
  renewalId: string,
  attempt: number,
): string => `renewal:${renewalId}:${attempt}`;

/**
 * The credential a subscription's renewal should be charged against.
 *
 * The subscription's own `payment_method_id` first, then the customer's
 * default. A subscription that names nothing is the ordinary case - it means
 * "whatever is default at collection time", which is what a customer who has
 * only ever had one card expects and what keeps a replaced card working
 * without touching the subscription row.
 *
 * A named credential that has since been detached falls through to the
 * default rather than failing: detaching is the one state in which the
 * provider will refuse the token outright, and a customer with another live
 * card plainly meant for their subscription to keep running. A named
 * credential that is merely *invalid* is returned as it is, because the
 * decision about what to do with a dead credential belongs to the caller and
 * is visible on the row it hands back.
 */
export const resolveRenewalPaymentMethod = async (
  subscriptionId: string,
): Promise<RenewalPaymentMethod | null> => {
  const subscription = await db
    .select({
      userId: subscriptions.userId,
      paymentMethodId: subscriptions.paymentMethodId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1)
    .then(([row]) => row);

  if (!subscription) {
    throw new Error(`Subscription ${subscriptionId} does not exist.`);
  }

  const columns = {
    id: paymentMethods.id,
    provider: paymentMethods.provider,
    type: paymentMethods.type,
    externalId: paymentMethods.externalId,
    brand: paymentMethods.brand,
    last4: paymentMethods.last4,
    invalidAt: paymentMethods.invalidAt,
  };

  if (subscription.paymentMethodId) {
    const named = await db
      .select(columns)
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.id, subscription.paymentMethodId),
          // [!] The credential must belong to the customer being billed. The
          // composite foreign key already guarantees it; asked again here
          // because this is the query whose answer money is taken against.
          eq(paymentMethods.userId, subscription.userId),
          isNull(paymentMethods.detachedAt),
        ),
      )
      .limit(1)
      .then(([row]) => row);

    if (named) return named;
  }

  return (
    (await db
      .select(columns)
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.userId, subscription.userId),
          eq(paymentMethods.isDefault, true),
          isNull(paymentMethods.detachedAt),
        ),
      )
      // At most one default survives `payment_methods_user_id_default_index`,
      // so the ordering only decides what happens if that index is ever
      // dropped. Newest first is the one a customer would expect.
      .orderBy(desc(paymentMethods.createdAt))
      .limit(1)
      .then(([row]) => row)) ?? null
  );
};

export interface RenewalCollection {
  /**
   * Exactly what the provider said, unmapped.
   *
   * A local refusal - no credential, or one already known to be dead - is
   * reported in the same shape rather than as a thrown error, because it is
   * the same kind of answer: this renewal did not collect, and here is the
   * code. Nothing here decides what that means for the dunning ladder.
   */
  result: OffSessionResult;
  /**
   * The credential the charge was made against, when there was one.
   *
   * Returned alongside the result because the caller cannot ask again without
   * risking a different answer, and because two of its jobs need it: marking
   * a dead credential `invalid_at`, and naming the card in a dunning email.
   */
  paymentMethod: RenewalPaymentMethod | null;
  /** The key the charge was made under. Null when no charge was attempted. */
  idempotencyKey: string | null;
}

/**
 * Obtains the money for a claimed renewal.
 *
 * **This module decides nothing about dunning.** It resolves a credential,
 * presents it, and reports what came back. Whether the answer costs an attempt,
 * schedules a retry, or suspends a server is `renew-subscription.ts`'s
 * business, and keeping the two apart is what makes "a transport failure must
 * not spend a rung" a rule with exactly one place to be wrong.
 *
 * **No database transaction is open across the provider call, ever.** A charge
 * is a network round trip to somebody else's service with somebody else's
 * timeout, and a row lock held for its duration is a lock held for however
 * long the provider feels like taking - against the very rows the retry sweep,
 * the webhook and the customer's own dashboard need. Everything this function
 * reads is read before the call and nothing is written after it.
 *
 * Transport failures are left to throw. An unreachable provider is not the
 * customer's card saying no, and the only way for the caller to tell those
 * apart is for one to be a value and the other an exception.
 */
export const collectForRenewal = async (
  renewal: CollectableRenewal,
): Promise<RenewalCollection> => {
  if (!renewal.orderId) {
    // The order is what a payment is recorded against and what the extension
    // workflow settles the renewal from. Charging without one would take money
    // for something no webhook could ever match back.
    throw new Error(
      `Renewal ${renewal.id} has no order yet; nothing may be charged for it.`,
    );
  }

  const paymentMethod = await resolveRenewalPaymentMethod(
    renewal.subscriptionId,
  );

  if (!paymentMethod) {
    return {
      result: {
        status: "failed",
        code: NO_PAYMENT_METHOD_CODE,
        retryable: true,
        message:
          "The customer has no saved payment method to charge for this renewal.",
      },
      paymentMethod: null,
      idempotencyKey: null,
    };
  }

  if (paymentMethod.invalidAt) {
    // Refused here rather than at the provider. Presenting a credential the
    // provider has already told us is dead cannot succeed, and every
    // presentation is one more decline on the customer's card - which is what
    // issuers count when they decide to block a merchant.
    return {
      result: {
        status: "failed",
        code: PAYMENT_METHOD_INVALID_CODE,
        retryable: true,
        message: `Payment method ${paymentMethod.id} was marked invalid at ${paymentMethod.invalidAt.toISOString()}.`,
      },
      paymentMethod,
      idempotencyKey: null,
    };
  }

  const subscription = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.id, renewal.subscriptionId))
    .limit(1)
    .then(([row]) => row);

  if (!subscription) {
    throw new Error(
      `Subscription ${renewal.subscriptionId} does not exist; renewal ${renewal.id} cannot be collected.`,
    );
  }

  // The plan as it read when the order was written, so the customer's
  // statement says the same thing a manual extension would have said.
  const description = await db
    .select({ name: orderItems.name })
    .from(orderItems)
    .where(eq(orderItems.orderId, renewal.orderId))
    .limit(1)
    .then(([row]) => (row ? `${row.name} renewal` : FALLBACK_DESCRIPTION));

  const chargeOffSession = await requirePaymentCapability(
    paymentMethod.provider,
    "chargeOffSession",
  );

  const idempotencyKey = renewalIdempotencyKey(renewal.id, renewal.attempt);

  const result = await chargeOffSession({
    orderId: renewal.orderId,
    userId: subscription.userId,
    total: { amount: renewal.amount, currency: renewal.currency },
    paymentMethodExternalId: paymentMethod.externalId,
    idempotencyKey,
    description,
  });

  return { result, paymentMethod, idempotencyKey };
};
