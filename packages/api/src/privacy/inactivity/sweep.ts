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

import { and, eq, gte, inArray, isNull, lte, or, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  invoices,
  orders,
  payments,
  servers,
  users,
} from "@virtbase/db/schema";
import {
  ACCOUNT_INACTIVITY_GRACE_PERIOD_DAYS,
  ACCOUNT_INACTIVITY_REMINDER_DAYS,
} from "@virtbase/utils";
import type { AccountActivity } from "./eligibility";
import { inactiveBefore, isEligibleForInactivityDeletion } from "./eligibility";

export interface SweepCandidate {
  userId: string;
  name: string;
  email: string;
  locale: string | null;
  activity: AccountActivity;
}

/**
 * Accounts worth asking the predicate about.
 *
 * The `WHERE` is a coarse filter, not the rule: it narrows a table of every
 * customer down to the handful that could plausibly qualify, and
 * {@link isEligibleForInactivityDeletion} makes the actual decision. Keeping
 * the two apart is what lets the rule be tested against fabricated accounts
 * instead of against SQL.
 */
export async function findInactivityCandidates(
  now: Date = new Date(),
): Promise<SweepCandidate[]> {
  const cutoff = inactiveBefore(now);

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      locale: users.locale,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
      deletionScheduledAt: users.deletionScheduledAt,
      offboardingStartedAt: users.offboardingStartedAt,
      anonymizedAt: users.anonymizedAt,
    })
    .from(users)
    .where(
      and(
        isNull(users.anonymizedAt),
        isNull(users.offboardingStartedAt),
        isNull(users.deletionScheduledAt),
        or(
          and(isNull(users.lastSeenAt), lte(users.createdAt, cutoff)),
          lte(users.lastSeenAt, cutoff),
        ),
      ),
    );

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.userId);

  // Counted in bulk rather than per account: the sweep runs over every
  // customer, and one query per candidate per fact is four round trips each.
  const [serverCounts, unpaidCounts, openOrderCounts, recentBilling] =
    await Promise.all([
      countBy(servers.userId, servers, inArray(servers.userId, ids)),
      countBy(
        invoices.userId,
        invoices,
        and(
          inArray(invoices.userId, ids),
          isNull(invoices.paidAt),
          isNull(invoices.cancelledAt),
        ),
      ),
      countBy(
        orders.userId,
        orders,
        and(
          inArray(orders.userId, ids),
          inArray(orders.status, ["awaiting_payment", "fulfilling"]),
        ),
      ),
      countBy(
        payments.userId,
        payments,
        and(inArray(payments.userId, ids), gte(payments.createdAt, cutoff)),
      ),
    ]);

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    locale: row.locale,
    activity: {
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
      deletionScheduledAt: row.deletionScheduledAt,
      offboardingStartedAt: row.offboardingStartedAt,
      anonymizedAt: row.anonymizedAt,
      servers: serverCounts.get(row.userId) ?? 0,
      unpaidInvoices: unpaidCounts.get(row.userId) ?? 0,
      openOrders: openOrderCounts.get(row.userId) ?? 0,
      recentBillingEvents: recentBilling.get(row.userId) ?? 0,
    },
  }));
}

// biome-ignore lint/suspicious/noExplicitAny: one shape per table, all counted the same way
async function countBy(column: any, table: any, where: any) {
  const rows = await db
    .select({ userId: column, count: sql<number>`count(*)::int` })
    .from(table)
    .where(where)
    .groupBy(column);

  return new Map<string, number>(
    rows.map((row) => [row.userId as string, row.count]),
  );
}

/**
 * Marks an account for deletion after the notice period.
 *
 * `deletion_notified_at` is written in the same statement as
 * `deletion_scheduled_at`, so the two cannot come apart - a scheduled deletion
 * nobody was told about is the one outcome this feature must never produce.
 */
export async function scheduleInactivityDeletion(
  userId: string,
  now: Date = new Date(),
): Promise<Date> {
  const scheduledAt = new Date(
    now.getTime() + ACCOUNT_INACTIVITY_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );

  await db
    .update(users)
    .set({
      deletionReason: "inactivity",
      deletionNotifiedAt: sql`now()`,
      deletionScheduledAt: scheduledAt,
    })
    .where(and(eq(users.id, userId), isNull(users.offboardingStartedAt)))
    .returning({ id: users.id });

  return scheduledAt;
}

/** Scheduled accounts approaching the deadline that have not been reminded. */
export async function findAccountsToRemind(now: Date = new Date()) {
  const threshold = new Date(
    now.getTime() + ACCOUNT_INACTIVITY_REMINDER_DAYS * 24 * 60 * 60 * 1000,
  );

  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      locale: users.locale,
      scheduledAt: users.deletionScheduledAt,
    })
    .from(users)
    .where(
      and(
        eq(users.deletionReason, "inactivity"),
        isNull(users.deletionReminderSentAt),
        isNull(users.offboardingStartedAt),
        lte(users.deletionScheduledAt, threshold),
      ),
    );
}

export async function markReminderSent(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ deletionReminderSentAt: sql`now()` })
    .where(eq(users.id, userId));
}
