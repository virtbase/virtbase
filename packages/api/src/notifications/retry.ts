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

import { and, eq, isNotNull, lte, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { notificationDeliveries } from "@virtbase/db/schema";
import { deliverNotification, MAX_DELIVERY_ATTEMPTS } from "./deliver";

/** Bounds the runtime of one cron invocation. */
const BATCH_SIZE = 100;

export interface RetryResult {
  attempted: number;
  delivered: number;
  skipped: number;
  failed: number;
}

/**
 * Re-sends deliveries that failed and are due for another try.
 *
 * This is what makes a channel outage a delay rather than a lost message, and
 * it is the reason `dispatchNotification` is allowed to swallow its errors.
 * A row past {@link MAX_DELIVERY_ATTEMPTS} has `next_attempt_at` cleared and
 * is never picked up again - it stays in the log as evidence that we tried.
 */
export const retryFailedNotifications = async (): Promise<RetryResult> => {
  const due = await db
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.status, "failed"),
        isNotNull(notificationDeliveries.nextAttemptAt),
        lte(notificationDeliveries.nextAttemptAt, sql`now()`),
        lte(notificationDeliveries.attempts, MAX_DELIVERY_ATTEMPTS - 1),
      ),
    )
    .orderBy(notificationDeliveries.nextAttemptAt)
    .limit(BATCH_SIZE);

  const result: RetryResult = {
    attempted: due.length,
    delivered: 0,
    skipped: 0,
    failed: 0,
  };

  const outcomes = await Promise.all(due.map(deliverNotification));
  for (const outcome of outcomes) result[outcome] += 1;

  return result;
};
