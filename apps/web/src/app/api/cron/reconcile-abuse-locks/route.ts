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

import { reconcileAbuseLocks } from "@virtbase/api/abuse";
import { db } from "@virtbase/db/client";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Puts back every abuse lock that is no longer in force.
 *
 * The customer's own API can edit their firewall options and their network
 * device, so a lock applied once is not a lock. This is what makes it one.
 * Drift is counted on the row and notified, because a customer removing the
 * same lock three times is evidence rather than a bug report.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting abuse lock reconciliation. Current time is:",
    new Date().toISOString(),
  );

  const result = await reconcileAbuseLocks({ db });

  console.log(
    "[CRON] Checked",
    result.checked,
    "abuse locks:",
    result.drifted,
    "re-applied,",
    result.released,
    "released,",
    result.failed,
    "unreachable.",
  );

  return new Response("OK", { status: 200 });
});

export { handler as GET };
