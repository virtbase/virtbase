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

import * as Sentry from "@sentry/nextjs";
import { refreshTemplateImages } from "@virtbase/api/template-images";
import { db } from "@virtbase/db/client";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Keeps every enabled template's image present and fresh on every node's
 * import storage, and settles downloads that are still in flight.
 *
 * Two jobs in one pass, deliberately. Warming is what keeps a customer from
 * paying for a 400 MB download inside their provisioning run, and reconciling
 * is what keeps a download started by a workflow from stranding when that
 * workflow ends - a row that never settles makes its template unavailable.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting template image refresh. Current time is:",
    new Date().toISOString(),
  );

  try {
    const { ready, downloading, failed, considered } =
      await refreshTemplateImages({ db });

    console.log(
      `[CRON] Template images: ${ready} ready, ${downloading} downloading, ${failed} failed, out of ${considered} considered.`,
    );
  } catch (error) {
    // A whole-pass failure is unexpected - per-node and per-template failures
    // are handled inside. Report it rather than returning a 200 that hides it.
    console.error(error);
    Sentry.captureException(error);

    return new Response("Template image refresh failed", {
      status: 500,
    });
  }

  return new Response("OK", {
    status: 200,
  });
});

export { handler as GET };
