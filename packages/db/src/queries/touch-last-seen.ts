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

import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { db as database } from "../client";
import { users } from "../schema";

/**
 * How stale `last_seen_at` may get before another write is worth it.
 *
 * The throttle lives in the `WHERE` rather than in a cache: one statement,
 * atomic, no second system to be unavailable, and a dashboard polling every
 * five seconds costs one write an hour instead of seven hundred.
 */
const STALE_AFTER = sql`INTERVAL '1 hour'`;

/**
 * Records that this account was used, and calls off an inactivity deletion if
 * one was pending.
 *
 * [!] Only an *inactivity* deletion. A customer who asked to be deleted and
 * then signs in to download their data before it happens has not changed their
 * mind, and silently cancelling on their behalf would be both surprising and a
 * way for an attacker with a session to indefinitely defer a deletion they
 * cannot otherwise stop. Scoped to `deletion_reason = 'inactivity'`, which is
 * the only kind the customer never asked for.
 *
 * Never clears anything once offboarding has started: by then there are
 * servers that no longer exist.
 */
export async function touchLastSeen(
  db: typeof database,
  userId: string,
): Promise<void> {
  await db
    .update(users)
    .set({
      lastSeenAt: sql`now()`,
      ...CLEARED_ON_ACTIVITY,
    })
    .where(
      and(
        eq(users.id, userId),
        isNull(users.offboardingStartedAt),
        isNull(users.anonymizedAt),
        or(
          isNull(users.lastSeenAt),
          sql`${users.lastSeenAt} < now() - ${STALE_AFTER}`,
          // Always write when an inactivity deletion is pending, throttle or
          // not: the whole point is that using the account stops it, and
          // "within the hour" is not soon enough for something irreversible.
          eq(users.deletionReason, "inactivity"),
        ),
      ),
    );
}

/**
 * What using the account undoes.
 *
 * Only meaningful alongside the `deletion_reason = 'inactivity'` guard above;
 * a row with any other reason matches the throttle branches instead and keeps
 * its schedule.
 */
const CLEARED_ON_ACTIVITY = {
  deletionReason: sql`CASE WHEN ${users.deletionReason} = 'inactivity' THEN NULL ELSE ${users.deletionReason} END`,
  deletionNotifiedAt: sql`CASE WHEN ${users.deletionReason} = 'inactivity' THEN NULL ELSE ${users.deletionNotifiedAt} END`,
  deletionReminderSentAt: sql`CASE WHEN ${users.deletionReason} = 'inactivity' THEN NULL ELSE ${users.deletionReminderSentAt} END`,
  deletionScheduledAt: sql`CASE WHEN ${users.deletionReason} = 'inactivity' THEN NULL ELSE ${users.deletionScheduledAt} END`,
};
