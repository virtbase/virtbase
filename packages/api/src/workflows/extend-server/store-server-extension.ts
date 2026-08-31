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
import { and, eq, ne, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxNodes,
  servers,
  subscriptionRenewals,
  subscriptions,
  users,
} from "@virtbase/db/schema";
import { FatalError } from "workflow";
import { liveSubscriptionFor } from "../../subscriptions/subject-subscription";
import { transitionSubscription } from "../../subscriptions/transition-subscription";

type StoreServerExtensionStepParams = {
  serverId: string;
  /**
   * The order that paid for this extension, when there is one.
   *
   * Only used to find the `subscription_renewals` row this extension settles.
   * Optional because most extensions have no renewal behind them - a customer
   * pressing the button, an operator, the dev scripts - and because every
   * server sold before subscriptions existed has no subscription at all.
   */
  orderId?: string | null;
};

/**
 * The period a subscription is left describing after an extension.
 *
 * Captured before the write so {@link rollbackStoreServerExtensionStep} can
 * put it back. The compensation already puts `terminates_at` back where it
 * was; leaving the subscription ahead of it would open exactly the divergence
 * this step exists to close, only in the direction where the customer is
 * billed for a term they do not have.
 */
export type PreviousSubscriptionPeriod = {
  id: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

export async function storeServerExtensionStep(
  params: StoreServerExtensionStepParams,
) {
  "use step";

  const { serverId, orderId } = params;

  const result = await db.transaction(
    async (tx) => {
      const server = await tx
        .select({
          vmid: servers.vmid,
          name: servers.name,
          proxmoxNode: {
            hostname: proxmoxNodes.hostname,
            fqdn: proxmoxNodes.fqdn,
            // [!] Sensitive data
            tokenID: proxmoxNodes.tokenID,
            tokenSecret: proxmoxNodes.tokenSecret,
          },
          user: {
            name: users.name,
            email: users.email,
            locale: users.locale,
          },
          suspendedAt: servers.suspendedAt,
          terminatesAt: servers.terminatesAt,
        })
        .from(servers)
        .innerJoin(proxmoxNodes, eq(servers.proxmoxNodeId, proxmoxNodes.id))
        .innerJoin(users, eq(servers.userId, users.id))
        .where(eq(servers.id, serverId))
        .limit(1)
        .then(([row]) => row);

      if (!server) {
        throw new FatalError(
          `Failed to extend server. Server not found. ID: ${serverId}`,
        );
      }

      // [!] Read and locked *before* the server is touched, and inside the same
      // transaction.
      //
      // `subscriptions.current_period_end` mirrors `servers.terminates_at`, and
      // the two are only worth anything if they can never disagree. Advancing
      // the term here and the period in a second statement outside this
      // transaction gives a crash in between two ways to be wrong, both of them
      // money: a period end left behind the term renews a customer who has
      // already paid for the month, and a period end left ahead of it hands out
      // service nobody is billed for. Neither is detectable afterwards without
      // reconciling every row by hand.
      //
      // Locked rather than merely read, so a renewal claim running against this
      // subscription serialises behind the extension instead of computing its
      // next period from a `current_period_end` this transaction is about to
      // move. Taken before the `servers` update to keep one lock order -
      // subscription, then server - across everything that touches both.
      const subscription = await tx
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          currentPeriodStart: subscriptions.currentPeriodStart,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
        })
        .from(subscriptions)
        .where(liveSubscriptionFor(serverId))
        .limit(1)
        .for("update")
        .then(([row]) => row);

      // The renewal this extension settles, if the order came from one. Read
      // and locked here, *before* the term is computed, because the period it
      // charged for is what the term has to become - see `paidThrough`.
      //
      // Matched on the order rather than on the period, because the order is
      // the only thing that both halves are certain to agree on: the renewal
      // wrote it, and it is what was paid.
      //
      // Scoped to this subscription as well, so a mismatched order id can only
      // fail to find a row rather than settle somebody else's.
      const claimed =
        subscription && orderId
          ? ((await tx
              .select({
                id: subscriptionRenewals.id,
                periodStart: subscriptionRenewals.periodStart,
                periodEnd: subscriptionRenewals.periodEnd,
              })
              .from(subscriptionRenewals)
              .where(
                and(
                  eq(subscriptionRenewals.orderId, orderId),
                  eq(subscriptionRenewals.subscriptionId, subscription.id),
                  ne(subscriptionRenewals.status, "succeeded"),
                ),
              )
              .limit(1)
              .for("update")
              .then(([row]) => row)) ?? null)
          : null;

      // [!] The term the customer actually paid for.
      //
      // `claimRenewal` computed this period end from the subscription's own
      // billing anchor - see `subscriptions/period.ts` - and the invoice was
      // written against it. Recomputing the term here as `+ INTERVAL '1 month'`
      // would hand out a *different* month: a subscription anchored on the 31st
      // sitting in `31 Jan -> 28 Feb` is charged through 31 Mar and would be
      // granted only 28 Mar, and the next claim would then recover an anchor of
      // 28 and stay there for good. The same recomputation ignores
      // `interval_months` outright, charging a quarterly subscription for three
      // months and granting one.
      //
      // So when there is a renewal behind the extension, the renewal's
      // `period_end` is authoritative for both `terminates_at` and
      // `current_period_end`, and the two still move together.
      const paidThrough =
        claimed &&
        server.terminatesAt &&
        claimed.periodEnd > server.terminatesAt
          ? claimed.periodEnd
          : null;

      if (claimed && !paidThrough) {
        // The renewal charged for a period that does not extend this server's
        // term - a term that has already been pushed past it by hand, or a
        // server with no term at all. Granting it would *shorten* a term the
        // customer holds, so the fallback below wins and the divergence is
        // reported.
        Sentry.captureMessage(
          `[storeServerExtensionStep] Renewal ${claimed.id} charged through ${claimed.periodEnd.toISOString()}, which does not extend server ${serverId}'s term ${server.terminatesAt?.toISOString() ?? "(none)"}; the term was advanced by one month instead.`,
          "warning",
        );
      }

      const updated = await tx
        .update(servers)
        .set({
          // If server was previously suspended, unsuspend it
          // User is allowed to start the server again
          suspendedAt: null,
          // The renewal's own period end when there is one, and otherwise
          // exactly one month on the termination date.
          terminatesAt:
            paidThrough ??
            sql`CASE WHEN ${servers.terminatesAt} IS NULL THEN NULL ELSE ${servers.terminatesAt} + INTERVAL '1 month' END`,
          // Reset renewal reminder sent at
          renewalReminderSentAt: null,
        })
        .where(eq(servers.id, serverId))
        .returning({
          newTerminatesAt: servers.terminatesAt,
        })
        .then(([row]) => row);

      if (!updated) {
        throw new FatalError(`Failed to update server. ID: ${serverId}`);
      }

      const { newTerminatesAt } = updated;

      let previousPeriod: PreviousSubscriptionPeriod | null = null;
      let settledRenewalId: string | null = null;

      // Everything below is conditional on there *being* a subscription, and
      // nothing above it was. Every server sold before this table existed has
      // none and nothing backfills them, so this is the common path, not the
      // exceptional one: an extension must complete exactly as it always did
      // when there is nothing here to move.
      if (subscription && newTerminatesAt) {
        // The period being served becomes the one that starts where the last
        // one ended. `subscriptions_period_range` refuses a period that ends
        // before it begins, so the start only moves when the new term is
        // genuinely ahead of the old period end - otherwise the row is being
        // corrected back onto a `terminates_at` that had drifted behind it,
        // and its start has to stay where it is.
        //
        // With a renewal behind the extension both endpoints come off the
        // renewal instead: it is the period that was invoiced, the row the
        // customer would be shown, and `subscription_renewals_period_range`
        // has already guaranteed that it ends after it begins.
        const nextPeriodStart = paidThrough
          ? (claimed?.periodStart ?? subscription.currentPeriodEnd)
          : newTerminatesAt > subscription.currentPeriodEnd
            ? subscription.currentPeriodEnd
            : subscription.currentPeriodStart;

        if (newTerminatesAt > nextPeriodStart) {
          previousPeriod = {
            id: subscription.id,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
          };

          await tx
            .update(subscriptions)
            .set({
              currentPeriodStart: nextPeriodStart,
              // Exactly the value written to `terminates_at` above, read back
              // from the same statement rather than recomputed. That mattered
              // most on the manual path, which is still `+ INTERVAL '1 month'`:
              // it clamps in Postgres' own way, and a second, JavaScript
              // implementation of "a month later" would disagree with it every
              // time the term ends on the 29th, 30th or 31st. On the renewal
              // path the value came from `subscription_renewals.period_end` and
              // was written verbatim, so reading it back keeps the two columns
              // provably identical rather than merely computed alike.
              currentPeriodEnd: newTerminatesAt,
            })
            .where(eq(subscriptions.id, subscription.id));
        } else {
          // Both endpoints would end up ahead of the new term, which no
          // ordinary path can produce: it needs a subscription whose period was
          // already more than a month past `terminates_at`. Writing anything
          // would violate the range check and fail an extension the customer
          // paid for, so the term wins and the divergence is reported.
          Sentry.captureMessage(
            `[storeServerExtensionStep] Subscription ${subscription.id} has a period (${subscription.currentPeriodStart.toISOString()} -> ${subscription.currentPeriodEnd.toISOString()}) ahead of server ${serverId}'s new term ${newTerminatesAt.toISOString()}; period left unchanged.`,
            "warning",
          );
        }

        if (claimed) {
          // The row located and locked above, settled now that the term it
          // paid for has actually been granted.
          const settled = await tx
            .update(subscriptionRenewals)
            .set({
              status: "succeeded",
              settledAt: sql`now()`,
              // Nothing is owed any more. Left set, the retry sweep picks this
              // renewal up again and charges a customer who has just paid.
              nextAttemptAt: null,
            })
            .where(
              and(
                eq(subscriptionRenewals.id, claimed.id),
                ne(subscriptionRenewals.status, "succeeded"),
              ),
            )
            .returning({ id: subscriptionRenewals.id })
            .then(([row]) => row);

          settledRenewalId = settled?.id ?? null;
        }
      }

      // `terminatesAt` is pulled out rather than carried on `server`: the value
      // read at the top of the transaction is the term as it was *before* this
      // step, and leaving it on the object every later step reads as "the
      // server" is an invitation to use a stale term. It goes back as
      // `previousTerminatesAt`, which is what it is.
      const { proxmoxNode, user, terminatesAt, ...rest } = server;

      return {
        server: rest,
        proxmoxNode,
        user,
        newTerminatesAt,
        previousTerminatesAt: terminatesAt,
        previousSubscriptionPeriod: previousPeriod,
        subscriptionId: subscription?.id ?? null,
        settledRenewalId,
      };
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  // [!] After the commit, and never inside it. `transitionSubscription` opens
  // its own transaction and takes its own row lock; calling it from inside the
  // one above would either deadlock against that lock or run on a second
  // pooled connection that cannot see the uncommitted extension.
  //
  // Only when a renewal was actually settled. A manual extension says nothing
  // about whether the customer meant to resume automatic billing, so it must
  // not walk a `cancelled` subscription back to `active` behind their back; a
  // renewal that was paid, on the other hand, must not leave the subscription
  // sitting in `past_due` for the dunning sweep to find.
  if (result.settledRenewalId && result.subscriptionId) {
    try {
      // `past_due -> active` and `suspended -> active` are the ones that
      // matter; `active -> active` is not a legal transition and `idempotent`
      // turns it into the no-op it should be.
      await transitionSubscription(result.subscriptionId, "active", {
        idempotent: true,
        reason: "renewal_settled",
      });
    } catch (error) {
      // Swallowed on purpose. The extension is committed, and this step is not
      // idempotent - the workflow runtime re-running it would add a *second*
      // month to a term that already has one. A subscription left in
      // `past_due` with a paid, succeeded renewal against it is visible and
      // repairable; a term silently extended twice is neither.
      Sentry.captureException(error);
    }
  }

  return {
    ...result,
  };
}

export async function rollbackStoreServerExtensionStep(
  params: StoreServerExtensionStepParams & {
    suspendedAt: Date | null;
    /**
     * The term as it stood before the extension, captured by the forward step.
     *
     * Restored rather than recomputed by subtracting a month, for the same
     * reason the period below is: the forward step no longer always *adds* a
     * month. A renewal-backed extension grants the renewal's own `period_end`,
     * which can be two months out on a quarterly subscription or a day short of
     * one on an anchored February, and `- INTERVAL '1 month'` would leave the
     * customer holding a term nobody ever bought.
     *
     * `undefined` - never `null`, which means "the term was and stays unset" -
     * falls back to the old subtraction, so a compensation replayed with params
     * recorded before this field existed still undoes an ordinary extension.
     */
    previousTerminatesAt?: Date | null;
    previousSubscriptionPeriod?: PreviousSubscriptionPeriod | null;
    /**
     * The renewal the forward step marked `succeeded`, if it settled one.
     *
     * The settlement is as much a part of the extension as the term is, and it
     * has to come back with it - see the note on the un-settle below.
     */
    settledRenewalId?: string | null;
  },
) {
  "use step";

  const {
    serverId,
    suspendedAt,
    previousTerminatesAt,
    previousSubscriptionPeriod,
    settledRenewalId,
  } = params;

  return db.transaction(
    async (tx) => {
      await tx
        .update(servers)
        .set({
          suspendedAt: suspendedAt,
          terminatesAt:
            undefined === previousTerminatesAt
              ? sql`CASE WHEN ${servers.terminatesAt} IS NULL THEN NULL ELSE ${servers.terminatesAt} - INTERVAL '1 month' END`
              : previousTerminatesAt,
          renewalReminderSentAt: sql`now()`,
        })
        .where(eq(servers.id, serverId));

      // The term is going back, so the period has to go with it - in the same
      // transaction, for the same reason it moved in one. Restored to the
      // captured values rather than recomputed by subtracting a month, so a
      // period that was corrected rather than advanced lands back where it was.
      if (previousSubscriptionPeriod) {
        await tx
          .update(subscriptions)
          .set({
            currentPeriodStart: previousSubscriptionPeriod.currentPeriodStart,
            currentPeriodEnd: previousSubscriptionPeriod.currentPeriodEnd,
          })
          .where(eq(subscriptions.id, previousSubscriptionPeriod.id));
      }

      // [!] The settlement goes back too, and this is the half that used to be
      // missed.
      //
      // A renewal left `succeeded` for a period the customer no longer holds
      // wedges the subscription permanently: `(subscription_id, period_start)`
      // is unique, so the next due sweep's `claimRenewal` loses its own
      // conflict and returns `null` for ever, while `succeeded` with no
      // `next_attempt_at` is invisible to the retry and reconcile sweeps as
      // well. Nothing is ever charged again, and
      // `/api/cron/suspend-terminated-servers` powers off a machine whose owner
      // has a working card on file.
      //
      // Returned to `pending` with an immediately due `next_attempt_at`, which
      // is exactly the state `claimRenewal` leaves behind and exactly what the
      // partial index `(next_attempt_at) WHERE status IN ('pending',
      // 'awaiting_action')` exists to find. The claim itself is *not* released:
      // the period is still owed and this row is still the record of it, it is
      // still what a paid order points at, and dropping it would let the due
      // sweep raise a second claim and a second order for one month.
      //
      // `attempt` is deliberately untouched. The retry then presents the same
      // `renewal:<id>:<attempt>` idempotency key, so a provider that already
      // took the money hands back the charge it made rather than making
      // another, and the ordinary settlement path runs again from there.
      //
      // Guarded on `succeeded`, which `storeServerExtensionStep` is the only
      // writer of: anything else in that column is somebody else's decision
      // about this renewal, arrived at after ours, and is not this
      // compensation's to overwrite.
      if (settledRenewalId) {
        await tx
          .update(subscriptionRenewals)
          .set({
            status: "pending",
            settledAt: null,
            nextAttemptAt: sql`now()`,
          })
          .where(
            and(
              eq(subscriptionRenewals.id, settledRenewalId),
              eq(subscriptionRenewals.status, "succeeded"),
            ),
          );
      }
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
}
