/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { reconcileAbuseCases } from "@virtbase/api/abuse";
import { db } from "@virtbase/db/client";
import { withCronSecret } from "@/lib/with-cron-secret.ts";

/**
 * Advances every clock an abuse case runs on: grace windows that have expired,
 * customers who did not answer, and mitigations that have been watched long
 * enough to close.
 *
 * A cron rather than a page load, for the same reason backup reconciliation is
 * one. A deadline that only elapses while an operator happens to have the case
 * open is not a deadline, and a grace window nobody advances is a suspension
 * that never happens.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting abuse case reconciliation. Current time is:",
    new Date().toISOString(),
  );

  const result = await reconcileAbuseCases({ db });

  console.log(
    "[CRON] Abuse cases:",
    result.enforced,
    "enforced,",
    result.escalated,
    "escalated,",
    result.closed,
    "closed,",
    result.failed,
    "failed.",
  );

  return new Response("OK", { status: 200 });
});

export { handler as GET };
