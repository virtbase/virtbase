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

import { retryDueRenewals } from "@virtbase/api/billing";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Climbs the dunning ladder: every renewal whose `next_attempt_at` has passed.
 *
 * Every thirty minutes rather than hourly, because the rungs are days apart
 * and the cost of being late is a customer's server staying off longer than
 * the schedule they were told about. It cannot charge anything the ladder has
 * not scheduled - `next_attempt_at` is only ever written by a recorded
 * decline, a transport backoff, or reconciliation handing back a claim nobody
 * finished.
 *
 * **This sweep moves money**, on rows the due sweep already claimed and the
 * provider already declined. It needs no consent check of its own: a renewal
 * only exists because collection was authorised when it was claimed.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting renewal retries. Current time is:",
    new Date().toISOString(),
  );

  const result = await retryDueRenewals();

  console.log(
    "[CRON] Examined",
    result.examined,
    "due renewals:",
    result.collecting,
    "collecting,",
    result.retrying,
    "retrying,",
    result.exhausted,
    "exhausted,",
    result.skipped,
    "skipped,",
    result.failed,
    "threw.",
  );

  return new Response("OK", {
    status: 200,
  });
});

export { handler as GET };
