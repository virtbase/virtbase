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

import { sweepUntriagedCases } from "@virtbase/api/abuse";
import { db } from "@virtbase/db/client";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Reads the abuse reports nobody has looked at yet.
 *
 * A sweep rather than a step in the inbound webhook: a model call is slow and
 * costs money, and the webhook's job is to store the message before Resend
 * gives up on it.
 *
 * Everything it does is advisory. It fills in the category and severity an
 * operator would otherwise set by hand, and resolves the reported address to a
 * customer - which is deterministic, because the address came from the
 * reporter and the lookup is the allocation table. It never moves a case out
 * of triage and never enforces.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting assisted abuse triage. Current time is:",
    new Date().toISOString(),
  );

  const result = await sweepUntriagedCases({ db });

  console.log(
    "[CRON] Looked at",
    result.looked,
    "untriaged cases:",
    result.classified,
    "classified,",
    result.attributed,
    "attributed to a customer.",
  );

  return new Response("OK", { status: 200 });
});

export { handler as GET };
