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

import { purgeExpiredExports } from "@virtbase/api/privacy";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Deletes data exports whose retention window has closed.
 *
 * The expiry on `data_exports` is a promise to the customer that a complete
 * copy of their records is not sitting on our disks indefinitely. Without this
 * it is only a column.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting purge of expired data exports. Current time is:",
    new Date().toISOString(),
  );

  const purged = await purgeExpiredExports();

  console.log("[CRON] Purged", purged, "expired data exports.");

  return new Response("OK", { status: 200 });
});

export { handler as GET };
