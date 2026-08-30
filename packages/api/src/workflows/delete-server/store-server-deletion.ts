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

import { eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { servers, subnetAllocations } from "@virtbase/db/schema";
import { FatalError } from "workflow";
import { revalidateCheckout } from "../shared/revalidate-checkout";

type StoreServerDeletionStepParams = {
  serverId: string;
};

export async function storeServerDeletionStep({
  serverId,
}: StoreServerDeletionStepParams) {
  "use step";

  const result = await db.transaction(
    async (tx) => {
      // Deallocate all subnets.
      // [!] `tx`, never `db`. A bare `db` here commits on its own connection:
      // the addresses would be released even when the `FatalError` below rolls
      // the deletion back, leaving a live server with no allocation - and the
      // outer transaction holding one pooled client while this asked for a
      // second is how concurrent deletions starve the pool.
      await tx
        .update(subnetAllocations)
        .set({
          deallocatedAt: sql`now()`,
        })
        .where(eq(subnetAllocations.serverId, serverId));

      // Delete the server and referenced data
      const deleted = await tx
        .delete(servers)
        .where(eq(servers.id, serverId))
        .returning({
          name: servers.name,
        })
        .then(([row]) => row);

      if (!deleted) {
        throw new FatalError("Failed to store server deletion.");
      }

      return deleted;
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  revalidateCheckout();

  return {
    serverName: result.name,
  };
}
