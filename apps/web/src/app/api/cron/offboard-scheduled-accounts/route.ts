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

import { offboardUserWorkflow } from "@virtbase/api/workflows";
import { and, isNotNull, isNull, lte, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";
import { start } from "workflow/api";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Erases accounts whose grace period has run out.
 *
 * The shared executor for both triggers: a customer who confirmed by email and
 * a dormant account that timed out both arrive here with nothing but
 * `deletion_scheduled_at` set. Which of the two it was lives in
 * `deletion_reason`, and only changes the wording of the final email.
 *
 * `offboarding_started_at` being null is part of the query rather than checked
 * afterwards, so an account already being erased is never picked up twice -
 * and `claimAccountStep` refuses a second claim regardless.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting offboarding of scheduled accounts. Current time is:",
    new Date().toISOString(),
  );

  const due = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        isNotNull(users.deletionScheduledAt),
        lte(users.deletionScheduledAt, sql`now()`),
        isNull(users.offboardingStartedAt),
        isNull(users.anonymizedAt),
      ),
    );

  console.log("[CRON] Found", due.length, "accounts to offboard.");

  await Promise.all(
    due.map((user) => start(offboardUserWorkflow, [{ userId: user.id }])),
  );

  return new Response("OK", { status: 200 });
});

export { handler as GET };
