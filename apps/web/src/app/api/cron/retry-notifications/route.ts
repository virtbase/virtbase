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

import { retryFailedNotifications } from "@virtbase/api/notifications";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Re-sends notifications whose channel was unavailable.
 *
 * This is what lets `dispatchNotification` swallow a delivery failure instead
 * of failing the abuse suspension that caused it. Without the retry, "the
 * channel never throws at the caller" would just mean the message is lost.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting notification delivery retries. Current time is:",
    new Date().toISOString(),
  );

  const result = await retryFailedNotifications();

  console.log(
    "[CRON] Retried",
    result.attempted,
    "notification deliveries:",
    result.delivered,
    "delivered,",
    result.skipped,
    "skipped,",
    result.failed,
    "still failing.",
  );

  return new Response("OK", { status: 200 });
});

export { handler as GET };
