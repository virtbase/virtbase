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
import { and, asc, eq, inArray, lte, notExists, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { subscriptionRenewals, subscriptions } from "@virtbase/db/schema";
import type {
  RenewSubscriptionOutcome,
  RenewSubscriptionResult,
} from "./renew-subscription";
import { renewSubscription, retryRenewal } from "./renew-subscription";

/**
 * The maximum number of subscriptions collected per run.
 *
 * Each one is a claim, an order, a charge against a payment provider and a
 * handful of writes, run sequentially - so this is what keeps an hourly cron
 * inside a function timeout, and what keeps a month-end pile-up from becoming
 * one enormous burst against Stripe. Anything left over is found by the next
 * run an hour later, still ordered oldest first.
 */
export const RENEW_SUBSCRIPTIONS_BATCH_SIZE = 50;

/** The same bound for the retry sweep, which runs twice as often. */
export const RETRY_RENEWALS_BATCH_SIZE = 50;

/**
 * What a sweep did, in the shape its cron logs.
 *
 * Counted by outcome rather than summarised as "succeeded/failed", because the
 * two questions an operator has after a renewal run - how much money is now in
 * flight, and how many customers are one rung from suspension - have different
 * answers and both matter.
 */
export interface RenewalSweepResult {
  /** Subscriptions or renewals this run looked at. */
  examined: number;
  /** Charges submitted; the provider's webhook settles them. */
  collecting: number;
  /** Attempts that scheduled another rung of the ladder. */
  retrying: number;
  /** Ladders that ran out. Their subscriptions are now suspended. */
  exhausted: number;
  /** Renewals now waiting on the customer to authenticate. */
  awaitingAction: number;
  /** Renewals that threw. Each is reported to Sentry. */
  failed: number;
  /** Nothing to do: not claimed, already in flight, transport rescheduled. */
  skipped: number;
}

const emptyResult = (): RenewalSweepResult => ({
  examined: 0,
  collecting: 0,
  retrying: 0,
  exhausted: 0,
  awaitingAction: 0,
  failed: 0,
  skipped: 0,
});

const count = (
  result: RenewalSweepResult,
  outcome: RenewSubscriptionOutcome,
): void => {
  switch (outcome) {
    case "collecting":
      result.collecting++;
      break;
    case "retry_scheduled":
    case "no_retries":
      result.retrying++;
      break;
    case "exhausted":
      result.exhausted++;
      break;
    case "awaiting_action":
      result.awaitingAction++;
      break;
    default:
      // `not_claimed`, `superseded`, `rescheduled`, `not_collectable`.
      result.skipped++;
      break;
  }
};

export interface RenewDueSubscriptionsOptions {
  limit?: number;
}

/**
 * Collects every subscription whose period has run out.
 *
 * The status, `auto_renew` and `current_period_end` terms are written to match
 * `subscriptions`' partial index exactly -
 * `(current_period_end) WHERE status IN ('active', 'past_due') AND auto_renew`
 * - so a sweep that runs every hour against a table that is mostly rows it
 * must not touch stays proportional to what is actually due rather than to how
 * long the business has existed. Narrowing *those* further (`status =
 * 'active'`, an extra column on the table itself) puts the query back on a
 * sequential scan.
 *
 * `current_period_end <= now()` is asked of the database rather than compared
 * against `Date.now()`, so this sweep and `claimRenewal` decide with one clock.
 *
 * ## [!] Why the anti-join is not optional
 *
 * A subscription that is being dunned **never leaves the predicate above**.
 * `claimRenewal` writes the renewal row, but `current_period_end` only moves
 * when the extension is fulfilled, and the subscription stays `active` or
 * `past_due` for the whole ladder - seven days, or eight for a terminal
 * decline that leaves it `past_due` with no `next_attempt_at` at all. Those
 * rows carry the *oldest* `current_period_end` in the table, so `ORDER BY
 * current_period_end ASC LIMIT 50` selects exactly them, every hour, forever.
 * `claimRenewal` then loses its own `onConflictDoNothing` on every one and the
 * whole batch reports `not_claimed`.
 *
 * Fifty concurrently dunning subscriptions - a few thousand monthly renewals
 * at an ordinary decline rate - and the sweep never reaches a genuinely due
 * subscription again: no period claimed, no server renewed, `skipped: 50` in
 * the log and nothing else.
 *
 * So the batch is filled only with work this sweep can actually do. The
 * `NOT EXISTS` is the *exact* condition under which `claimRenewal`'s insert
 * would conflict - `(subscription_id, period_start)` is unique and the period
 * this sweep would claim is `current_period_end` - so it skips precisely the
 * subscriptions that would have come back `not_claimed` and nothing else. Any
 * renewal row already on that period has an owner: the retry sweep for a
 * scheduled `pending` rung, and `reconcileRenewals` for a stranded
 * `collecting`, an expired `awaiting_action` or an unscheduled claim.
 *
 * **The partial index still covers it.** The anti-join adds no term to
 * `subscriptions` itself, so the index remains fully applicable: Postgres
 * walks it in `current_period_end` order and probes
 * `subscription_renewals`' unique `(subscription_id, period_start)` index per
 * candidate row, stopping as soon as `limit` rows survive. The ordering
 * requirement is what keeps it there - a hash anti-join would have to sort
 * afterwards, which is more expensive than the nested loop for any batch this
 * small.
 *
 * Sequential rather than `Promise.all`: each subscription is a charge against
 * a payment provider, and firing fifty at once is how a rate limit turns a
 * renewal run into fifty transport failures. One bad subscription must not end
 * the sweep either.
 */
export const renewDueSubscriptions = async ({
  limit = RENEW_SUBSCRIPTIONS_BATCH_SIZE,
}: RenewDueSubscriptionsOptions = {}): Promise<RenewalSweepResult> => {
  const due = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        inArray(subscriptions.status, ["active", "past_due"]),
        eq(subscriptions.autoRenew, true),
        lte(subscriptions.currentPeriodEnd, sql`now()`),
        notExists(
          db
            .select({ one: sql`1` })
            .from(subscriptionRenewals)
            .where(
              and(
                eq(subscriptionRenewals.subscriptionId, subscriptions.id),
                eq(
                  subscriptionRenewals.periodStart,
                  subscriptions.currentPeriodEnd,
                ),
              ),
            ),
        ),
      ),
    )
    // Oldest first: those are the customers whose service has been out of term
    // the longest, and the ones a truncated batch must not keep starving.
    .orderBy(asc(subscriptions.currentPeriodEnd))
    .limit(limit);

  const result = emptyResult();
  result.examined = due.length;

  for (const subscription of due) {
    try {
      const outcome = await renewSubscription(subscription.id);
      count(result, outcome.outcome);
    } catch (error) {
      result.failed++;
      console.error(
        `[renewals] Subscription ${subscription.id} threw during collection.`,
        error,
      );
      Sentry.captureException(error);
    }
  }

  return result;
};

export interface RetryDueRenewalsOptions {
  limit?: number;
}

/**
 * Charges every renewal the ladder says is due again.
 *
 * `status = 'pending' AND next_attempt_at <= now()` implies the partial index
 * on `(next_attempt_at) WHERE status IN ('pending', 'awaiting_action')`, so
 * this stays an index scan over the handful of rows that are due rather than a
 * walk through every renewal ever attempted.
 *
 * `awaiting_action` rows carry a `next_attempt_at` too, but it is a deadline
 * rather than a retry: the intent is live and must not be charged again while
 * the customer may still be authenticating it. `reconcileRenewals` owns those,
 * and asks the provider what became of them before spending a rung.
 */
export const retryDueRenewals = async ({
  limit = RETRY_RENEWALS_BATCH_SIZE,
}: RetryDueRenewalsOptions = {}): Promise<RenewalSweepResult> => {
  const due = await db
    .select({
      id: subscriptionRenewals.id,
      subscriptionId: subscriptionRenewals.subscriptionId,
      amount: subscriptionRenewals.amount,
      currency: subscriptionRenewals.currency,
      attempt: subscriptionRenewals.attempt,
    })
    .from(subscriptionRenewals)
    .where(
      and(
        eq(subscriptionRenewals.status, "pending"),
        lte(subscriptionRenewals.nextAttemptAt, sql`now()`),
      ),
    )
    .orderBy(asc(subscriptionRenewals.nextAttemptAt))
    .limit(limit);

  const result = emptyResult();
  result.examined = due.length;

  for (const renewal of due) {
    try {
      const outcome: RenewSubscriptionResult = await retryRenewal(renewal.id);
      count(result, outcome.outcome);
    } catch (error) {
      result.failed++;
      console.error(`[renewals] Renewal ${renewal.id} threw on retry.`, error);
      Sentry.captureException(error);
    }
  }

  return result;
};
