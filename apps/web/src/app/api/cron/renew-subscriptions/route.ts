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

import { renewDueSubscriptions } from "@virtbase/api/billing";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Collects every subscription whose paid-for period has run out.
 *
 * Hourly, a few minutes past the hour so it does not start inside the same
 * minute as every other hourly job. The period end is a timestamp rather than
 * a date, so a subscription that falls due at 09:14 waits at most until the
 * next run - and the claim itself
 * refuses anything that is not genuinely due, so running more often would only
 * mean more empty sweeps. The work is bounded per run inside
 * `renewDueSubscriptions`; whatever a busy hour leaves over is found by the
 * next one, oldest first.
 *
 * **This sweep moves money.** There is no rehearsal switch: what stops a
 * customer being charged is that they have not asked to be. A subscription is
 * only ever collected once it is `active`/`past_due`, `auto_renew` is on, and
 * a mandate has been recorded against it - three facts the customer creates
 * deliberately, and none of which an environment variable can undo.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting subscription renewals. Current time is:",
    new Date().toISOString(),
  );

  const result = await renewDueSubscriptions();

  console.log(
    "[CRON] Examined",
    result.examined,
    "due subscriptions:",
    result.collecting,
    "collecting,",
    result.awaitingAction,
    "awaiting the customer,",
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
