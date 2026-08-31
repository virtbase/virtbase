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

import { and, eq, ne } from "@virtbase/db";
import type { Executor } from "@virtbase/db/client";
import { db } from "@virtbase/db/client";
import type { Subscription, SubscriptionStatus } from "@virtbase/db/schema";
import { subscriptions } from "@virtbase/db/schema";
import type { SubscriptionTransitionResult } from "./transition-subscription";
import { transitionSubscription } from "./transition-subscription";

/** The only subject type sold today. Matches the schema's check constraint. */
export const SERVER_SUBJECT_TYPE = "server";

/**
 * "The live subscription for this subject", as one predicate.
 *
 * `status <> 'ended'` rather than a positive list, matching
 * `subscriptions_subject_live_index` exactly. The index is partial on the same
 * expression, so anything that narrows it differently - `status = 'active'`,
 * say - would miss the `past_due` and `suspended` rows that are precisely the
 * ones a deletion has to close, and would let a second subscription be opened
 * against a subject that already has one.
 *
 * Exported as a condition rather than a query because the callers do not agree
 * on an executor: the crons read on the client, the extension and the upgrade
 * read inside the transaction that moves the server, and only one predicate
 * between them keeps those from drifting.
 */
export const liveSubscriptionFor = (
  subjectId: string,
  subjectType: string = SERVER_SUBJECT_TYPE,
) =>
  and(
    eq(subscriptions.subjectType, subjectType),
    eq(subscriptions.subjectId, subjectId),
    ne(subscriptions.status, "ended"),
  );

/**
 * Finds the live subscription for a subject, if there is one.
 *
 * Returns `undefined` far more often than not: every server sold before
 * subscriptions existed has none, and nothing backfills them. **A missing
 * subscription is an ordinary answer, never an error** - see the callers,
 * which all carry on without one.
 */
export const findLiveSubscription = async (
  executor: Executor,
  subjectId: string,
  subjectType: string = SERVER_SUBJECT_TYPE,
): Promise<Subscription | undefined> =>
  executor
    .select()
    .from(subscriptions)
    .where(liveSubscriptionFor(subjectId, subjectType))
    .limit(1)
    .then(([row]) => row);

export interface TransitionSubjectSubscriptionOptions {
  subjectType?: string;
  /** `system`, `admin:<user id>`, `customer:<user id>`. */
  actor?: string;
  /** Recorded on the row as `cancel_reason` when the target status takes one. */
  reason?: string;
}

/**
 * Moves the live subscription for a subject, if it has one.
 *
 * **The reason this exists.** `subscriptions.subject_id` is deliberately not a
 * foreign key - a subscription has to outlive the server it paid for, or a
 * deletion would take the billing history with the machine. The cost is that
 * the database will not notice when a subject goes away, and a subscription
 * whose subject is gone is a standing instruction to charge for nothing. Every
 * path that destroys or suspends a server therefore has to say so here, in
 * code, because nothing else will.
 *
 * Always `idempotent`. Two of the three callers are crons that re-run over the
 * same rows - a second pass finds an already-`ended` subscription, which this
 * does not match at all, or an already-`suspended` one, which the state machine
 * refuses to move to itself. Both must be quiet no-ops rather than a failed
 * cron run.
 *
 * Returns `null` when the subject has no live subscription, which is the
 * common case and not a fault.
 */
export const transitionSubjectSubscription = async (
  subjectId: string,
  to: SubscriptionStatus,
  {
    subjectType = SERVER_SUBJECT_TYPE,
    actor,
    reason,
  }: TransitionSubjectSubscriptionOptions = {},
): Promise<SubscriptionTransitionResult | null> => {
  const subscription = await findLiveSubscription(db, subjectId, subjectType);
  if (!subscription) return null;

  return transitionSubscription(subscription.id, to, {
    actor,
    reason,
    idempotent: true,
  });
};
