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

import { pollAbuseSources } from "@virtbase/api/abuse";
import { db } from "@virtbase/db/client";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Asks every pull source what has been reported about our own ranges.
 *
 * The only thing Virtbase polls. Everything else pushes, and AbuseIPDB has no
 * webhook - so the only way to learn that one of our addresses is being
 * reported is to go and ask.
 *
 * Hourly rather than more often: the sweep is bounded by a daily provider
 * quota, and spending it faster does not find anything sooner.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting abuse source poll. Current time is:",
    new Date().toISOString(),
  );

  const results = await pollAbuseSources({ db });

  for (const result of results) {
    console.log(
      "[CRON] Source",
      result.source,
      "covered",
      result.covered,
      "of",
      result.offered,
      "ranges,",
      result.signals,
      "signals,",
      result.cases,
      "cases.",
      result.error ? `Error: ${result.error}` : "",
    );
  }

  return new Response("OK", { status: 200 });
});

export { handler as GET };
