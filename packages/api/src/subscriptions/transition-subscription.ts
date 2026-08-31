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
import { eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import type { SubscriptionStatus } from "@virtbase/db/schema";
import { subscriptions } from "@virtbase/db/schema";
import {
  assertSubscriptionTransition,
  canTransitionSubscription,
} from "../lib/subscription-status";

export interface SubscriptionTransitionOptions {
  /** `system`, `provider:stripe`, `admin:<user id>`, `customer:<user id>`. */
  actor?: string;
  reason?: string;
  /**
   * Treat a transition that is not currently legal as a no-op rather than an
   * error.
   *
   * Same reason as orders: payment providers redeliver, and out of order. A
   * late decline for a period that has since been collected would otherwise
   * throw, and throwing makes the provider retry the delivery forever.
   */
  idempotent?: boolean;
  /**
   * Refuse the transition unless the subscription is still exactly as the
   * caller last read it.
   *
   * Optimistic concurrency for callers that decided *outside* the row lock
   * that a transition is warranted - a dunning sweep that read a batch a
   * minute ago, an operator action queued behind a page load. Suspension is
   * the one that needs it most: suspending on the strength of a stale read
   * powers off a server whose customer has since paid.
   *
   * Refusal is reported as `changed: false`, not thrown: losing this race is
   * ordinary, and the next run will look again.
   */
  guard?: (subscription: {
    status: SubscriptionStatus;
    updatedAt: Date;
  }) => boolean;
}

export interface SubscriptionTransitionResult {
  status: SubscriptionStatus;
  /** False when the subscription was already in the target status. */
  changed: boolean;
}

const DEFAULT_ACTOR = "system";

/**
 * Records a transition that actually happened.
 *
 * There is no `subscription_transitions` table, unlike orders. A subscription
 * changes state a handful of times over its life where an order changes state
 * several times an hour, and the states it passes through are already legible
 * from columns that have to exist anyway - `cancelled_at`, `ended_at`,
 * `cancel_reason`, and one row per period in `subscription_renewals` carrying
 * its own attempt count and decline code. What the log adds over those is the
 * *actor*: who cancelled, and why.
 *
 * A `subscription_transitions` table is the obvious next step the moment audit
 * needs deepen - a billing dispute that turns on who pressed cancel, or an
 * admin surface that wants to render a history. It would slot in here exactly
 * as `orderTransitions` does in `transitionOrder`, written inside the same
 * transaction as the update so the history can never disagree with the row.
 */
const recordTransition = (
  subscriptionId: string,
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  options: SubscriptionTransitionOptions,
): void => {
  const actor = options.actor ?? DEFAULT_ACTOR;
  const message = `[subscriptions] ${subscriptionId} ${from} -> ${to} by ${actor}${
    options.reason ? `: ${options.reason}` : ""
  }`;

  console.info(message);

  // A breadcrumb rather than an event: on its own a transition is not worth
  // anyone's attention, but when a later collection or enforcement throws, the
  // trail of how this subscription got into its current state is the first
  // thing the person reading the report will want.
  Sentry.addBreadcrumb({
    category: "subscription",
    level: "info",
    message,
    data: { subscriptionId, from, to, actor, reason: options.reason },
  });
};

/**
 * Moves a subscription to a new status, recording why.
 *
 * Runs the read and the write in one transaction with a row lock, because a
 * dunning sweep and a customer pressing "resume" would otherwise both read
 * `past_due` and both act on it - one suspending the server, the other
 * reactivating it, in whichever order the writes happen to land.
 */
export const transitionSubscription = async (
  subscriptionId: string,
  to: SubscriptionStatus,
  options: SubscriptionTransitionOptions = {},
): Promise<SubscriptionTransitionResult> => {
  const outcome = await db.transaction(
    async (tx) => {
      const subscription = await tx
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          cancelReason: subscriptions.cancelReason,
          updatedAt: subscriptions.updatedAt,
        })
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .limit(1)
        .for("update")
        .then(([row]) => row);

      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} does not exist.`);
      }

      // Checked under the lock, which is the only place it means anything.
      if (options.guard && !options.guard(subscription)) {
        return { status: subscription.status, changed: false, from: null };
      }

      // `past_due -> past_due` is legal (a second decline), so ask the machine
      // rather than assuming sameness means no-op.
      if (!canTransitionSubscription(subscription.status, to)) {
        if (options.idempotent) {
          return { status: subscription.status, changed: false, from: null };
        }
        assertSubscriptionTransition(subscription.status, to);
      }

      await tx
        .update(subscriptions)
        .set({
          status: to,
          ...(to === "cancelled" && { cancelledAt: sql`now()` }),
          ...(to === "ended" && { endedAt: sql`now()` }),
          // Coming back to `active` is a resume: a customer who cancelled and
          // changed their mind, or one whose card finally went through. Left
          // set, `cancelled_at` makes a live subscription render as "ends on
          // the 3rd" forever, and every reader that treats the column as the
          // question "is this cancelled" gets the wrong answer.
          ...(to === "active" && { cancelledAt: null, cancelReason: null }),
          ...(options.reason && to === "cancelled"
            ? { cancelReason: options.reason }
            : {}),
          // Ending records a reason only when nothing has claimed the column
          // yet. A subscription that ends because the customer cancelled last
          // week stopped for *that* reason; overwriting it with
          // `period_elapsed` erases the only answer anyone will want later.
          ...(options.reason && to === "ended" && !subscription.cancelReason
            ? { cancelReason: options.reason }
            : {}),
        })
        .where(eq(subscriptions.id, subscriptionId));

      return { status: to, changed: true, from: subscription.status };
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  // Logged after the commit, so a transaction that rolls back leaves no trail
  // claiming something happened that did not.
  if (outcome.changed && outcome.from) {
    recordTransition(subscriptionId, outcome.from, to, options);
  }

  return { status: outcome.status, changed: outcome.changed };
};
