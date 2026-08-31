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

import { and, eq, inArray, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import type {
  RenewalStatus,
  SubscriptionRenewal,
  SubscriptionStatus,
} from "@virtbase/db/schema";
import { subscriptionRenewals, subscriptions } from "@virtbase/db/schema";
// Imported from the modules rather than the `../subscriptions` barrel, which
// also re-exports the period arithmetic and the subject helpers; the claim and
// the order are the only two things this driver needs from there.
import {
  claimRenewal,
  createRenewalOrder,
} from "../subscriptions/claim-renewal";
import type { CollectableRenewal } from "./collect";
import { collectForRenewal } from "./collect";
import type { RenewalOutcome } from "./record-outcome";
import {
  markRenewalCollecting,
  recordCollectionResult,
  rescheduleAfterTransportError,
} from "./record-outcome";

/**
 * Subscription statuses a *claimed* renewal may still be charged in.
 *
 * Wider than `RENEWABLE_SUBSCRIPTION_STATUSES`, which governs taking a new
 * claim, and it has to be: `servers.terminates_at` runs out at the same
 * instant the period does, so `/api/cron/suspend-terminated-servers` powers
 * the machine off and moves the subscription to `suspended` within fifteen
 * minutes of a renewal falling due. Refusing to retry a suspended
 * subscription would end the dunning ladder for very nearly every customer on
 * its first rung - and `suspended` is precisely the state the schema calls
 * "the one non-terminal state money can still fix".
 *
 * `cancelled` and `ended` are absent on purpose. The customer has said not to
 * charge them again, or there is nothing left to charge for.
 */
const COLLECTABLE_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  "active",
  "past_due",
  "suspended",
]);

/**
 * Renewal statuses that may legitimately be closed as `abandoned`.
 *
 * **Only `pending`,** and the guard has to name the statuses rather than
 * whatever was read a moment ago. `storeServerExtensionStep` settles a renewal
 * to `succeeded` in the transaction that moves the term, and it can land
 * between the read below and the write: guarding on the read value would then
 * fire `WHERE status = 'succeeded'`, overwrite a paid, settled renewal with
 * `abandoned`, stamp it with a fresh `settled_at` and a message saying it was
 * never collected, and leave `rollbackStoreServerExtensionStep`'s own
 * `WHERE status = 'succeeded'` guard with nothing to match. The customer's
 * billing history would then say a period they paid for was abandoned.
 *
 * The rest are excluded for reasons of their own. `collecting` is somebody
 * else's attempt in flight - closing it strands the charge that attempt
 * submitted. `awaiting_action` has a live intent at the provider that has to
 * be cancelled before anything else happens to the row, which is
 * `reconcileRenewals`' job when the window closes; the decline it records
 * lands the row in `pending`, where the next retry sweep abandons it properly.
 * `succeeded`, `failed` and `abandoned` are already settled.
 */
const ABANDONABLE_RENEWAL_STATUSES: readonly RenewalStatus[] = ["pending"];

export type RenewSubscriptionOutcome =
  | RenewalOutcome
  /** Another worker holds this period, or it is not due. Ordinary and silent. */
  | "not_claimed"
  /** The subscription has been cancelled or ended since the claim. */
  | "not_collectable";

export interface RenewSubscriptionResult {
  outcome: RenewSubscriptionOutcome;
  renewalId: string | null;
  orderId?: string | null;
  attempt?: number;
  nextAttemptAt?: Date | null;
}

/**
 * Collects one period for one subscription.
 *
 * ## Transaction boundaries
 *
 * Every step below opens and commits its own transaction, and the provider
 * call is made outside all of them. That is the shape on purpose: a charge is
 * a network round trip to somebody else's service with somebody else's
 * timeout, and a row lock held across it is a lock held against the retry
 * sweep, the webhook and the customer's own dashboard for as long as the
 * provider feels like taking.
 *
 * 1. {@link claimRenewal} - its own transaction, and the only thing that makes
 *    double billing impossible. `null` means somebody else won the race, or
 *    the period is not due; either way this returns quietly.
 * 2. {@link createRenewalOrder} - its own transaction. Skipped when the
 *    renewal already carries an order, which is what makes a retry of a
 *    half-finished claim safe.
 * 3. {@link markRenewalCollecting} - its own transaction. Written *before* the
 *    charge, so a worker that dies mid-charge leaves a row the reconciler can
 *    find.
 * 4. {@link collectForRenewal} - **no transaction at all.**
 * 5. {@link recordCollectionResult} - its own transaction.
 *
 * ## What step 5 must never do
 *
 * **It must never advance the term or the period.** `subscriptions
 * .current_period_end` mirrors `servers.terminates_at`, and the one place
 * either moves is `storeServerExtensionStep`, in the transaction that also
 * moves the server, when the payment has settled and the extension has been
 * fulfilled. A charge that was submitted is not a term: `processing` can still
 * fail, a webhook can arrive saying so, and a period advanced here would have
 * given away a month nobody paid for with nothing left in the system to notice.
 * A successful collection writes `collecting` and stops.
 */
export const renewSubscription = async (
  subscriptionId: string,
): Promise<RenewSubscriptionResult> => {
  // ── Step 1: the claim. Its own transaction, inside `claimRenewal`. ────────
  const renewal = await claimRenewal(subscriptionId);

  // Not ours: another worker holds the period, renewal is switched off, the
  // period is not due, or the subscription may not be charged. All ordinary.
  if (!renewal) return { outcome: "not_claimed", renewalId: null };

  return driveRenewalAttempt(renewal);
};

/**
 * Retries a renewal that has already been claimed and already declined.
 *
 * Deliberately **not** a call to {@link renewSubscription}: the claim is the
 * insert, and the period has already been claimed, so `claimRenewal` would
 * lose its own conflict and report "somebody else has it" for every retry ever
 * scheduled. What the ladder retries is the *attempt*, not the claim.
 */
export const retryRenewal = async (
  renewalId: string,
): Promise<RenewSubscriptionResult> => {
  const renewal = await db
    .select({
      renewal: subscriptionRenewals,
      subscriptionStatus: subscriptions.status,
    })
    .from(subscriptionRenewals)
    .innerJoin(
      subscriptions,
      eq(subscriptionRenewals.subscriptionId, subscriptions.id),
    )
    .where(eq(subscriptionRenewals.id, renewalId))
    .limit(1)
    .then(([row]) => row);

  if (!renewal) {
    throw new Error(`Renewal ${renewalId} does not exist.`);
  }

  if (!COLLECTABLE_SUBSCRIPTION_STATUSES.has(renewal.subscriptionStatus)) {
    // The customer cancelled, or the subject went away, while the ladder was
    // still climbing. Settled rather than merely skipped: left `pending` with
    // a due `next_attempt_at`, this renewal is picked up by every retry sweep
    // for the rest of the table's life.
    const abandoned = await db
      .update(subscriptionRenewals)
      .set({
        status: "abandoned",
        nextAttemptAt: null,
        settledAt: sql`now()`,
        failureMessage: `Subscription is ${renewal.subscriptionStatus}; the renewal was abandoned rather than collected.`,
      })
      .where(
        and(
          eq(subscriptionRenewals.id, renewalId),
          // Only if it is still waiting. A row somebody else is charging right
          // now, or one a webhook has just settled, is not ours to close - and
          // the guard is on the statuses that may be abandoned, never on
          // whatever status the read above happened to see. See
          // {@link ABANDONABLE_RENEWAL_STATUSES}.
          inArray(subscriptionRenewals.status, ABANDONABLE_RENEWAL_STATUSES),
        ),
      )
      .returning({ id: subscriptionRenewals.id })
      .then(([row]) => row);

    console.info(
      `[renewals] ${renewalId} not collectable: subscription ${renewal.renewal.subscriptionId} is ${renewal.subscriptionStatus}.${abandoned ? " Renewal abandoned." : ""}`,
    );

    return { outcome: "not_collectable", renewalId };
  }

  return driveRenewalAttempt(renewal.renewal);
};

/**
 * Order, claim the attempt, charge, record. Shared by the due sweep and the
 * retry sweep, so a first attempt and a fifth are the same code.
 */
export const driveRenewalAttempt = async (
  claimed: SubscriptionRenewal,
): Promise<RenewSubscriptionResult> => {
  // ── Step 2: the order. Its own transaction, inside `createRenewalOrder`. ──
  //
  // Idempotent by re-reading: a renewal that already has one gets it back
  // rather than a second order. That is what makes a crash between the claim
  // and the link recoverable, and it is why the claim and the order are
  // deliberately not atomic - see the note on `createRenewalOrder`.
  const orderId = claimed.orderId ?? (await createRenewalOrder(claimed));

  // ── Step 3: take the attempt. Its own transaction. ────────────────────────
  //
  // Before the provider is called, never after: a row that has sat in
  // `collecting` is a worker that went away mid-charge, and that is the only
  // trace such a worker leaves. It is also the claim - two overlapping sweeps
  // race here and exactly one gets a row.
  const collecting = await markRenewalCollecting(claimed.id);

  if (!collecting) {
    return { outcome: "superseded", renewalId: claimed.id, orderId };
  }

  const renewal: CollectableRenewal = { ...collecting, orderId };

  // ── Step 4: the charge. NO TRANSACTION IS OPEN HERE. ──────────────────────
  let collection: Awaited<ReturnType<typeof collectForRenewal>>;

  try {
    collection = await collectForRenewal(renewal);
  } catch (error) {
    // The provider could not be reached, or answered with something that is
    // not an answer about the customer's card. **This must not spend a rung.**
    // An hour of somebody else's downtime must never suspend customers whose
    // cards were fine.
    const rescheduled = await rescheduleAfterTransportError(renewal.id, error);

    return {
      outcome: rescheduled.outcome,
      renewalId: renewal.id,
      orderId,
      attempt: rescheduled.attempt,
      nextAttemptAt: rescheduled.nextAttemptAt,
    };
  }

  // ── Step 5: record what happened. Its own transaction. ────────────────────
  //
  // [!] This step never advances the term or the period. See the note on
  // `renewSubscription`, and on `recordCollectionResult`.
  const recorded = await recordCollectionResult(renewal.id, collection);

  console.info(
    `[renewals] ${renewal.id} attempt ${collection.idempotencyKey ?? "(no charge made)"} -> ${recorded.outcome}${
      recorded.nextAttemptAt
        ? `, next at ${recorded.nextAttemptAt.toISOString()}`
        : ""
    }.`,
  );

  return {
    outcome: recorded.outcome,
    renewalId: renewal.id,
    orderId,
    attempt: recorded.attempt,
    nextAttemptAt: recorded.nextAttemptAt,
  };
};
