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
import { servers } from "@virtbase/db/schema";
import { revalidateTag } from "next/cache";

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
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  revalidateTag("checkout", "max");
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
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  revalidateTag("checkout", "max");
}
