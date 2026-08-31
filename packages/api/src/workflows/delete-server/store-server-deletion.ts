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

import * as Sentry from "@sentry/node";
import { eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { servers, subnetAllocations } from "@virtbase/db/schema";
import { FatalError } from "workflow";
import { transitionSubjectSubscription } from "../../subscriptions/subject-subscription";
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

  // [!] After the commit, and it has to happen here rather than being left to
  // the database.
  //
  // `subscriptions.subject_id` is deliberately not a foreign key - a
  // subscription outlives the server it paid for, so the last renewal, the
  // last invoice and any dispute over either survive the machine being
  // destroyed. Nothing cascades, which means nothing stops a live subscription
  // pointing at a server that no longer exists, and a live subscription with
  // no subject is a standing instruction to charge for nothing.
  //
  // Deliberately not inside the transaction above: `transitionSubscription`
  // opens its own and takes its own row lock. Running it after the commit also
  // gets the ordering right - a deletion that rolls back must not have ended
  // the subscription of a server that is still there.
  //
  // This is the step every deletion route goes through, `deleteOneServer` and
  // therefore account offboarding included, so there is one place to keep
  // correct rather than one per caller.
  //
  // [!] Reported, never thrown, for the same reason `storeServerExtensionStep`
  // swallows its own post-commit transition. The `servers` row is gone and
  // committed, and this step is not idempotent: a `DELETE ... RETURNING` that
  // is replayed matches nothing, `!deleted` is true, and the `FatalError` above
  // permanently fails a deletion that in fact succeeded - and skips
  // `revalidateCheckout()` on the way out. A pool timeout or a lock on the
  // subscription would be enough to trigger it.
  //
  // A subscription left live against a deleted server is visible and
  // repairable, and three other things already look for exactly that:
  // `/api/cron/delete-suspended-servers` and
  // `/api/cron/suspend-terminated-servers` make this identical call - both of
  // them wrapped like this - before the deletion is ever queued, and
  // `claimRenewal` refuses to claim a subscription whose subject cannot be
  // priced.
  try {
    await transitionSubjectSubscription(serverId, "ended", {
      reason: "server_deleted",
    });
  } catch (error) {
    console.error(
      "[workflow] Failed to end the subscription for deleted server",
      serverId,
      error,
    );
    Sentry.captureException(error);
  }

  revalidateCheckout();

  return {
    serverName: result.name,
  };
}
