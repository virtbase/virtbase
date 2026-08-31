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

import {
  and,
  asc,
  eq,
  gt,
  isNotNull,
  isNull,
  ne,
  notExists,
  sql,
} from "@virtbase/db";
import type { Executor } from "@virtbase/db/client";
import { servers, subscriptions } from "@virtbase/db/schema";

/**
 * Subscriptions for the servers that predate subscriptions.
 *
 * Every server sold before the subscription tables existed carries a
 * `terminates_at` and nothing else - the term is recorded, the standing
 * agreement behind it is not. `createServerSubscriptionStep` writes one for
 * every server provisioned from now on, so without a backfill the fleet is
 * split in two forever and every reader has to keep asking "and what if there
 * is no row".
 *
 * ## This changes nobody's billing
 *
 * **`autoRenew` is `false` and `mandateAcceptedAt` is `null`, always, and
 * there is deliberately no option, flag, argument or environment variable that
 * can make this script write anything else.** Look for one before adding one:
 * its absence is the point.
 *
 * Backfilling is bookkeeping. Not one of these customers has been asked
 * whether we may charge them while they are not present, and inventing that
 * consent on their behalf - for tens of thousands of servers at once, silently,
 * from a migration script - would be unlawful under SCA and the payment
 * schemes' own mandate rules, would be reversed on request by every provider,
 * and would be a straightforward betrayal of people who bought a month of
 * hosting. The opt-in that records `mandate_accepted_at` and its wording
 * version is a customer action and belongs in the product, one customer at a
 * time.
 *
 * What the rows are for until then: `claimRenewal` skips a subscription whose
 * `autoRenew` is false, so nothing downstream can act on one of these. Their
 * value is that the record exists and agrees with `terminates_at`, so the
 * renewal UI, the lifecycle sweeps and the eventual opt-in all have something
 * to attach to.
 */

/** Everything sold today is a monthly term. See {@link periodStartFor}. */
export const BACKFILL_INTERVAL_MONTHS = 1;

/** Servers read per round trip. Large enough to be worth a query, small
 * enough that a run holds a bounded amount of memory whatever the fleet size. */
export const BACKFILL_BATCH_SIZE = 200;

/** Days in a UTC month. Day 0 of the next month is the last day of this one. */
const daysInUtcMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * When the term that ends at `end` began.
 *
 * **The evidence available, and why this is the best of it.** A server row
 * records when its term *ends* and nothing about when the current one started.
 * `installed_at` is the start of the *first* period, not the current one, so
 * for any server that has ever been extended it is wrong by however many
 * months it has been renewed - years, for the oldest customers. The one thing
 * that is reliably true is the length of a term: every purchase and every
 * extension moves `terminates_at` by exactly `INTERVAL '1 month'`
 * (`store-server-extension.ts`), so the period the customer is inside began
 * one calendar month before it ends.
 *
 * Calendar months, not 30 days, and clamped the way Postgres clamps: 31 Mar
 * goes back to 28 Feb. This mirrors {@link nextPeriodEnd} in reverse so a
 * backfilled row and a renewed one describe the same shape of period, and
 * `billingAnchorDay` recovers the same anchor from either.
 *
 * Subtracting a calendar month always lands strictly earlier, so the
 * `subscriptions_period_range` check can never fire on a row this produces.
 */
export const periodStartFor = (
  end: Date,
  intervalMonths: number = BACKFILL_INTERVAL_MONTHS,
): Date => {
  const absoluteMonth = end.getUTCMonth() - intervalMonths;
  const year = end.getUTCFullYear() + Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12;

  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(end.getUTCDate(), daysInUtcMonth(year, month)),
      end.getUTCHours(),
      end.getUTCMinutes(),
      end.getUTCSeconds(),
      end.getUTCMilliseconds(),
    ),
  );
};

export interface BackfillCandidate {
  serverId: string;
  serverName: string;
  userId: string;
  serverPlanPriceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

/**
 * The servers that want a subscription and have none.
 *
 * Three conditions, in the order they exclude the most:
 *
 * - **`terminates_at` is set.** A server with no term has nothing to renew and
 *   no period to record. There is no soft-delete column on `servers` - a
 *   deleted server is a deleted row - so "not deleted" needs no predicate.
 * - **Not suspended.** `suspended_at` starts the deletion clock, so the
 *   machine is on its way out; `delete-suspended-servers` would close the
 *   subscription within days of it being opened.
 * - **No live subscription.** `status <> 'ended'`, written to match
 *   `subscriptions_subject_live_index` exactly. Anything narrower - `status =
 *   'active'` - would miss the `past_due`, `suspended` and `cancelled` rows and
 *   try to open a second subscription against a subject that already has one.
 *
 * A server whose term has already elapsed but which has not been suspended yet
 * is deliberately included: `suspend-terminated-servers` will move its
 * subscription to `suspended` on its next pass, which is the state the fleet
 * should have been in all along. With `autoRenew` false nothing charges it in
 * the meantime.
 *
 * Keyset paging on the primary key rather than `OFFSET`: the set shrinks as
 * rows are written, and an offset over a shrinking set skips rows.
 */
export const findBackfillCandidates = async (
  executor: Executor,
  {
    after = null,
    limit = BACKFILL_BATCH_SIZE,
  }: { after?: string | null; limit?: number } = {},
): Promise<BackfillCandidate[]> => {
  const rows = await executor
    .select({
      serverId: servers.id,
      serverName: servers.name,
      userId: servers.userId,
      // The price row locked to the server, which is what a manual extension
      // charges and what an upgrade re-points. See the note on
      // `subscriptions.server_plan_price_id`.
      serverPlanPriceId: servers.serverPlanPriceId,
      terminatesAt: servers.terminatesAt,
    })
    .from(servers)
    .where(
      and(
        isNotNull(servers.terminatesAt),
        isNull(servers.suspendedAt),
        after ? gt(servers.id, after) : undefined,
        notExists(
          executor
            .select({ one: sql`1` })
            .from(subscriptions)
            .where(
              and(
                eq(subscriptions.subjectType, "server"),
                eq(subscriptions.subjectId, servers.id),
                ne(subscriptions.status, "ended"),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(servers.id))
    .limit(limit);

  return rows.map(({ terminatesAt, ...row }) => ({
    ...row,
    // Non-null by the predicate above; the column type does not know that.
    currentPeriodEnd: terminatesAt as Date,
    currentPeriodStart: periodStartFor(terminatesAt as Date),
  }));
};

export interface BackfillProgress {
  /** Candidates considered so far. */
  scanned: number;
  created: number;
  skipped: number;
  /** The last server id looked at, to resume from. */
  cursor: string;
}

export interface BackfillSubscriptionsOptions {
  db: Executor;
  /**
   * **Defaults to true.** Forgetting the flag has to be the harmless
   * direction: this script writes one row per server in the fleet, and there
   * is no undo that distinguishes the rows it wrote from the ones it did not.
   */
  dryRun?: boolean;
  batchSize?: number;
  /** Stop after this many candidates. Bounds a first run on a large fleet. */
  limit?: number;
  /** Resume from a server id, exclusive. */
  after?: string | null;
  /** Called once per batch, for progress output. */
  onProgress?: (progress: BackfillProgress) => void;
  /** Called for each candidate. Used by `--dry-run` to print the plan. */
  onCandidate?: (candidate: BackfillCandidate) => void;
}

export interface BackfillSubscriptionsResult extends BackfillProgress {
  dryRun: boolean;
  /** Null when nothing matched at all. */
  cursor: string;
}

/**
 * Creates the missing subscriptions, in batches, resumably.
 *
 * **Idempotent.** `subscriptions_subject_live_index` already refuses a second
 * live subscription for a subject, so a re-run cannot double-bill whatever
 * else goes wrong - but a partial unique index raises rather than skipping, so
 * the conflict is handled here rather than left to crash a run that is 90%
 * done. `ON CONFLICT DO NOTHING` is written without a target on purpose: the
 * index is partial, and a bare `DO NOTHING` covers it without having to
 * restate its predicate in a second place where it could drift.
 *
 * Between the read and the insert another writer may have created the
 * subscription - a provisioning workflow finishing, or a second copy of this
 * script. Those rows come back as `skipped`, which is the mechanism working.
 *
 * **Resumable** in two senses: a run bounded by `limit` reports the `cursor`
 * to continue from, and a run that dies halfway needs no cursor at all,
 * because the servers it already did no longer match `findBackfillCandidates`.
 */
export const backfillSubscriptions = async ({
  db,
  dryRun = true,
  batchSize = BACKFILL_BATCH_SIZE,
  limit,
  after = null,
  onProgress,
  onCandidate,
}: BackfillSubscriptionsOptions): Promise<BackfillSubscriptionsResult> => {
  let cursor = after;
  let scanned = 0;
  let created = 0;
  let skipped = 0;

  for (;;) {
    const remaining = undefined === limit ? batchSize : limit - scanned;
    if (0 >= remaining) break;

    const candidates = await findBackfillCandidates(db, {
      after: cursor,
      limit: Math.min(batchSize, remaining),
    });

    if (0 === candidates.length) break;

    for (const candidate of candidates) onCandidate?.(candidate);

    scanned += candidates.length;
    // The last id read, not the last id written: a candidate skipped by a
    // conflict must not be looked at again either.
    cursor = candidates[candidates.length - 1]?.serverId ?? cursor;

    if (dryRun) {
      // Counted as if it had worked, so the number printed by the safe mode is
      // the number the real run will write.
      created += candidates.length;
    } else {
      const inserted = await db
        .insert(subscriptions)
        .values(
          candidates.map((candidate) => ({
            userId: candidate.userId,
            subjectType: "server",
            subjectId: candidate.serverId,
            serverPlanPriceId: candidate.serverPlanPriceId,
            intervalMonths: BACKFILL_INTERVAL_MONTHS,
            currentPeriodStart: candidate.currentPeriodStart,
            currentPeriodEnd: candidate.currentPeriodEnd,
            // [!] Not configurable, and not a placeholder waiting to be
            // flipped. Read the note at the top of this file before touching
            // either of these two lines.
            autoRenew: false,
            mandateAcceptedAt: null,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: subscriptions.id });

      created += inserted.length;
      skipped += candidates.length - inserted.length;
    }

    onProgress?.({ scanned, created, skipped, cursor: cursor ?? "" });
  }

  return { scanned, created, skipped, cursor: cursor ?? "", dryRun };
};
