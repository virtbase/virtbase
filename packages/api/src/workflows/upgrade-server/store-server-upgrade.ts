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

import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { servers, subscriptions } from "@virtbase/db/schema";
import { liveSubscriptionFor } from "../../subscriptions/subject-subscription";
import { revalidateCheckout } from "../shared/revalidate-checkout";

export async function storeServerUpgradeStep({
  serverId,
  serverPlanId,
  serverPlanPriceId,
}: {
  serverId: string;
  serverPlanId: string;
  serverPlanPriceId: string;
}) {
  "use step";

  // Upgrades are pro-rated: the customer's term length does not change,
  // they pay only the difference for the time remaining. `terminatesAt`
  // therefore stays untouched here — only the plan and the locked price
  // row move. The same is true on rollback below.
  await db.transaction(
    async (tx) => {
      await tx
        .update(servers)
        .set({
          serverPlanId,
          serverPlanPriceId,
        })
        .where(eq(servers.id, serverId));

      // The subscription follows the server onto the new price row, in the
      // same transaction that moves the server onto it.
      //
      // Bookkeeping today rather than a change in what anybody is charged:
      // `resolveServerRenewalPrice` quotes from the row locked to the
      // *server*, which is what a manual extension charges and what already
      // follows an upgrade. Leaving `subscriptions.server_plan_price_id`
      // behind would not misprice anything yet - but it would leave two
      // columns that are supposed to describe the same agreement disagreeing,
      // and the schema note on that column describes re-pointing it here as
      // the step that lets the server's copy eventually go. The day something
      // does price against it, it has to already be right.
      //
      // `notNull` on the column, so this is an update of an existing row and
      // never an insert: a server with no subscription simply matches nothing.
      await tx
        .update(subscriptions)
        .set({ serverPlanPriceId })
        .where(liveSubscriptionFor(serverId));
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  revalidateCheckout();
}

export async function rollbackStoreServerUpgradeStep({
  serverId,
  previousServerPlanId,
  previousServerPlanPriceId,
}: {
  serverId: string;
  previousServerPlanId: string;
  previousServerPlanPriceId: string;
}) {
  "use step";

  await db.transaction(
    async (tx) => {
      await tx
        .update(servers)
        .set({
          serverPlanId: previousServerPlanId,
          serverPlanPriceId: previousServerPlanPriceId,
        })
        .where(eq(servers.id, serverId));

      // Back onto whatever the server is going back onto, in the same
      // transaction. Restored to the server's previous row rather than to
      // whatever the subscription happened to hold before, because the
      // invariant being kept is that the two agree - and a subscription that
      // had drifted off the server's row before this upgrade is a row that was
      // already wrong.
      await tx
        .update(subscriptions)
        .set({ serverPlanPriceId: previousServerPlanPriceId })
        .where(liveSubscriptionFor(serverId));
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  revalidateCheckout();
}
