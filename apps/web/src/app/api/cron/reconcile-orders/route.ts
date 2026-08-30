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

import { reconcileOrders } from "@virtbase/api/orders";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Fulfils the orders that were paid for and then dropped.
 *
 * Both webhook handlers run `fulfilOrder` after the payment event has been
 * claimed under its unique `(provider, eventId)` constraint, and Stripe sends
 * one `payment_intent.succeeded` per intent — so a throw, a timeout or a
 * deploy anywhere after that claim leaves the customer charged with no server
 * and no redelivery that can help. Nothing else in the system reads the orders
 * table on a clock, which is what makes this the only path back.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting order reconciliation. Current time is:",
    new Date().toISOString(),
  );

  const result = await reconcileOrders();

  console.log(
    "[CRON] Examined",
    result.examined,
    "stranded orders:",
    result.fulfilled,
    "fulfilled,",
    result.failed,
    "still failing.",
  );

  return new Response("OK", {
    status: 200,
  });
});

export { handler as GET };
