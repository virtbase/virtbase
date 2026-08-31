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

import { reconcileRenewals } from "@virtbase/api/billing";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Finishes the renewals whose attempt was left hanging.
 *
 * A renewal is marked `collecting` immediately before the provider is called,
 * so a timeout, a deploy or a function that ran out of time leaves a row that
 * nothing else in the system would ever look at again - the customer's card
 * possibly charged, their server certainly not extended. This asks the
 * provider what actually happened and settles from the answer, exactly as
 * `/api/cron/reconcile-orders` does for a payment whose webhook was lost.
 *
 * Every ten minutes, matching the grace period a `collecting` row is given
 * before it is treated as abandoned.
 *
 * Nothing here starts a charge, and nothing here may be changed to. It settles
 * charges that already exist, cancels ones nobody is going to finish, and
 * hands unstarted attempts to `/api/cron/retry-renewals`, which is the single
 * path in the system that presents a credential to a provider.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting renewal reconciliation. Current time is:",
    new Date().toISOString(),
  );

  const result = await reconcileRenewals();

  console.log(
    "[CRON] Examined",
    result.examined,
    "stranded renewals:",
    result.settled,
    "settled,",
    result.declined,
    "declined,",
    result.rescheduled,
    "rescheduled,",
    result.awaitingAction,
    "awaiting authentication,",
    result.inFlight,
    "still in flight,",
    result.failed,
    "threw.",
  );

  return new Response("OK", {
    status: 200,
  });
});

export { handler as GET };
