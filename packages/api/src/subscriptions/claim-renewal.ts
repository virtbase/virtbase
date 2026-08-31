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
import { and, eq, isNull, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import type { SubscriptionRenewal } from "@virtbase/db/schema";
import { subscriptionRenewals, subscriptions } from "@virtbase/db/schema";
import type { OrderExtendServerPlanConfigurationSnapshot } from "@virtbase/validators";
import { resolveServerRenewalPrice } from "../lib/renewal-price";
import { isRenewableSubscriptionStatus } from "../lib/subscription-status";
// Imported from the module rather than the `../orders` barrel on purpose: the
// barrel re-exports the Stripe and Anonpay settlement paths and the workflow
// client, and nothing about deciding that a renewal is due should drag a
// payment provider into this module's import graph. Renewal decides *that* a
// charge should happen; it never moves money.
import { createOrder } from "../orders/create-order";
import { billingAnchorDay, nextPeriodEnd } from "./period";

/**
 * The subject types a renewal knows how to price.
 *
 * `subjectType` exists so the collector never has to be taught a second time,
 * but today only servers are sold, and a renewal for anything else would have
 * to invent a price. Refusing loudly beats charging a guess.
 */
const RENEWABLE_SUBJECT_TYPES = new Set(["server"]);

/**
 * Claims the next billing period for a subscription.
 *
 * **The INSERT is the claim.** `(subscription_id, period_start)` is unique, so
 * two workers that both find the same subscription due - the cron overlapping
 * itself, a manual retry racing the sweep, a webhook arriving mid-run - race
 * to insert and exactly one wins. The loser gets zero rows back from
 * `onConflictDoNothing` and returns `null`. **Losing this race is ordinary and
 * must never throw**: it is the mechanism working, not a fault, and paging
 * somebody every time two workers overlap is how an alert channel gets muted.
 *
 * The row lock below is not what provides that safety - it only serialises the
 * two workers so they read the same period rather than interleaving. The
 * uniqueness of the period is what makes double billing impossible, and it
 * holds without any assumption that a queue is exactly-once or that a worker
 * survives long enough to clean up after itself.
 *
 * Returns `null` rather than throwing in every "not ours to take" case: the
 * period is already claimed, renewal is switched off, no mandate has been
 * recorded, the period has not run out yet, or the subscription is in a state
 * that must not be charged. A caller sweeping a batch wants to skip and carry
 * on.
 *
 * ## This is only half of a renewal
 *
 * A claim is not an order. `createRenewalOrder` is the other half, and the two
 * are **deliberately not atomic** - see the note on that function before
 * changing either.
 */
export const claimRenewal = async (
  subscriptionId: string,
): Promise<SubscriptionRenewal | null> =>
  db.transaction(
    async (tx) => {
      const subscription = await tx
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          subjectType: subscriptions.subjectType,
          subjectId: subscriptions.subjectId,
          intervalMonths: subscriptions.intervalMonths,
          currency: subscriptions.currency,
          currentPeriodStart: subscriptions.currentPeriodStart,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          autoRenew: subscriptions.autoRenew,
          mandateAcceptedAt: subscriptions.mandateAcceptedAt,
          // Asked of the database rather than compared against `Date.now()`,
          // so the decision uses one clock. A worker whose host clock has
          // drifted forward would otherwise claim periods that are not due,
          // and charge customers early.
          due: sql<boolean>`${subscriptions.currentPeriodEnd} <= now()`,
        })
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .limit(1)
        .for("update")
        .then(([row]) => row);

      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} does not exist.`);
      }

      // Every one of these is checked under the lock, which is the only place
      // it means anything: without it a customer pressing "cancel" while the
      // sweep is mid-run is a coin toss.
      if (!isRenewableSubscriptionStatus(subscription.status)) return null;
      if (!subscription.autoRenew) return null;
      if (!subscription.due) return null;

      // [!] Consent, checked here because here is where money starts moving.
      //
      // A renewal is a merchant-initiated charge, and the artefact that
      // defends one in a dispute is `mandate_accepted_at` together with the
      // wording version beside it. A charge with no recorded consent is one
      // the provider reverses on request, so the claim - the thing every
      // charge is downstream of - is the right place for the guarantee to
      // live, not `subscriptions.setAutoRenew`. That procedure is one writer
      // of `auto_renew` among several possible ones (an admin fix, a future
      // backfill flag, a hand-run `UPDATE`), and an invariant that rests on a
      // single tRPC handler is an invariant one migration undoes.
      //
      // Deliberately *not* folded into the due sweep's predicate: that query
      // is written to match `subscriptions`' partial index on
      // `(current_period_end) WHERE status IN ('active', 'past_due') AND
      // auto_renew` exactly, and adding a column to it there would buy nothing
      // - the claim re-reads the row under a lock anyway, which is the only
      // place the answer cannot be stale.
      //
      // `auto_renew` on with no mandate is the one combination in this table
      // that is a bug rather than a customer's choice, so it is reported
      // rather than skipped in silence - but it is still a skip. Refusing
      // loudly here would fail a whole sweep over one bad row.
      if (!subscription.mandateAcceptedAt) {
        Sentry.captureMessage(
          `[claimRenewal] Subscription ${subscriptionId} has auto_renew on with no mandate on file; nothing claimed.`,
          "warning",
        );
        return null;
      }

      if (!RENEWABLE_SUBJECT_TYPES.has(subscription.subjectType)) {
        throw new Error(
          `Subscription ${subscriptionId} has unsupported subject type "${subscription.subjectType}".`,
        );
      }

      // Resolved now and frozen onto the row below. An attempt on Tuesday must
      // charge what the first attempt on Friday quoted, or a price change
      // lands in the middle of a dunning sequence and the customer is asked
      // for a different number in every email.
      const price = await resolveServerRenewalPrice(tx, {
        serverId: subscription.subjectId,
      });

      if (!price) {
        // The server is gone - deleted, or never existed. `subject_id` is
        // deliberately not a foreign key, so this is a state the schema
        // allows and readers have to tolerate. There is no honest price for a
        // machine that does not exist, and the subscription's own
        // `server_plan_price_id` would produce one, so nothing is claimed.
        // Closing the subscription is a separate decision and belongs to the
        // sweep, which can see whether the subject is missing or merely
        // unreadable.
        Sentry.captureMessage(
          `[claimRenewal] Subscription ${subscriptionId} has no resolvable subject ${subscription.subjectType} ${subscription.subjectId}; nothing claimed.`,
          "warning",
        );
        return null;
      }

      // The period being collected for is the one that starts when the
      // paid-for period ends, not the one just finishing.
      const periodStart = subscription.currentPeriodEnd;
      const periodEnd = nextPeriodEnd(
        periodStart,
        subscription.intervalMonths,
        // Not `periodStart`'s own day: that value may already be a clamped
        // one, and re-anchoring on it is how a subscription walks backwards
        // through the calendar. See `billingAnchorDay`.
        billingAnchorDay(subscription),
      );

      const renewal = await tx
        .insert(subscriptionRenewals)
        .values({
          subscriptionId,
          periodStart,
          periodEnd,
          amount: price.renewalPrice,
          currency: subscription.currency,
        })
        .onConflictDoNothing({
          target: [
            subscriptionRenewals.subscriptionId,
            subscriptionRenewals.periodStart,
          ],
        })
        .returning()
        .then(([row]) => row);

      // Zero rows: somebody else holds this period. Ordinary, and silent.
      return renewal ?? null;
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

/**
 * Turns a claimed renewal into the extension order that will be charged.
 *
 * ## Why this is not part of the claim
 *
 * `createOrder` opens its own transaction. Making the claim and the order one
 * atomic unit would mean threading an executor through shared order code that
 * several other callers depend on, and that refactor is not worth what it
 * buys. So the sequence is: **commit the claim, then create the order, then
 * link it.**
 *
 * The window that leaves is real. A crash between the claim and the link
 * strands a `pending` renewal with `order_id = null` - and, if the crash
 * lands after `createOrder` returned, an `awaiting_payment` order nobody
 * points at. A later sweep retries such a renewal by calling this function
 * again, which is exactly why it is exported separately rather than buried
 * inside `claimRenewal`.
 *
 * What that window cannot do is the thing that matters: **nothing is ever
 * charged without a committed claim.** The claim is upstream of the order and
 * the order is upstream of any money, so the failure mode is a renewal that
 * has to be retried, never a customer billed twice. The opposite ordering -
 * order first, claim second - would trade a retryable renewal for a duplicate
 * charge, and duplicate charges cost a refund, a chargeback fee and a support
 * thread each.
 *
 * Idempotent by re-reading: a renewal that already carries an order returns
 * that order rather than creating a second one.
 */
export const createRenewalOrder = async (
  renewal: Pick<SubscriptionRenewal, "id" | "subscriptionId" | "amount">,
): Promise<string> => {
  const current = await db
    .select({
      orderId: subscriptionRenewals.orderId,
      userId: subscriptions.userId,
      subjectType: subscriptions.subjectType,
      subjectId: subscriptions.subjectId,
    })
    .from(subscriptionRenewals)
    .innerJoin(
      subscriptions,
      eq(subscriptionRenewals.subscriptionId, subscriptions.id),
    )
    .where(eq(subscriptionRenewals.id, renewal.id))
    .limit(1)
    .then(([row]) => row);

  if (!current) {
    throw new Error(`Renewal ${renewal.id} does not exist.`);
  }

  // Already done, by an earlier run or a concurrent one.
  if (current.orderId) return current.orderId;

  if (!RENEWABLE_SUBJECT_TYPES.has(current.subjectType)) {
    throw new Error(
      `Renewal ${renewal.id} has unsupported subject type "${current.subjectType}".`,
    );
  }

  const price = await resolveServerRenewalPrice(db, {
    serverId: current.subjectId,
  });

  if (!price) {
    throw new Error(
      `Renewal ${renewal.id} points at a ${current.subjectType} that no longer exists.`,
    );
  }

  const configuration: OrderExtendServerPlanConfigurationSnapshot = {
    type: "extend_server",
    version: 2,
    server_id: current.subjectId,
    server_plan_id: price.serverPlanId,
    server_plan_price_id: price.serverPlanPriceId,
  };

  const orderId = await createOrder({
    userId: current.userId,
    configuration,
    // The frozen claim amount, never today's price. The price row is read
    // above only for the plan and price ids the snapshot needs; if a price
    // correction has landed since the claim, the customer is charged what
    // they were quoted.
    totalAmount: renewal.amount,
    planName: price.planName,
  });

  const linked = await db
    .update(subscriptionRenewals)
    .set({ orderId })
    .where(
      and(
        eq(subscriptionRenewals.id, renewal.id),
        // Only if nobody linked one while `createOrder` was running. Without
        // this, two sweeps overlapping would each overwrite the other's order
        // id and leave an unpayable order attached to nothing.
        isNull(subscriptionRenewals.orderId),
      ),
    )
    .returning({ orderId: subscriptionRenewals.orderId })
    .then(([row]) => row);

  if (linked?.orderId) return linked.orderId;

  // Somebody else linked an order first. Ours is an unpaid `awaiting_payment`
  // order pointing at nothing - harmless, since no money moves until a
  // customer or a collection acts on an order, but worth knowing about.
  const winner = await db
    .select({ orderId: subscriptionRenewals.orderId })
    .from(subscriptionRenewals)
    .where(eq(subscriptionRenewals.id, renewal.id))
    .limit(1)
    .then(([row]) => row?.orderId);

  Sentry.captureMessage(
    `[createRenewalOrder] Renewal ${renewal.id} was linked to order ${winner} concurrently; order ${orderId} is orphaned.`,
    "warning",
  );

  if (!winner) {
    throw new Error(
      `Renewal ${renewal.id} could not be linked to order ${orderId}.`,
    );
  }

  return winner;
};
