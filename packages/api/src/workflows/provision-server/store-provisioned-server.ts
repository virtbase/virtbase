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

import { and, eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { servers, subnetAllocations } from "@virtbase/db/schema";
import { FatalError } from "workflow";
import { revalidateCheckout } from "../shared/revalidate-checkout";

type StoreProvisionedServerStepParams = {
  vmid: number;
  name: string;
  userId: string;
  serverPlanId: string;
  serverPlanPriceId: string;
  proxmoxNodeId: string;
  proxmoxTemplateId?: string | null;
  allocations: string[];
};

export async function storeProvisionedServerStep({
  vmid,
  name,
  userId,
  serverPlanId,
  serverPlanPriceId,
  proxmoxNodeId,
  proxmoxTemplateId,
  allocations,
}: StoreProvisionedServerStepParams) {
  "use step";

  const result = await db.transaction(
    async (tx) => {
      // [!] Idempotence, not defensiveness. A step that committed and then lost
      // its acknowledgement is re-run by the workflow runtime, and `servers`
      // carries a unique `(proxmox_node_id, vmid)` - so the retry used to die
      // on a constraint violation, after the first run had already written the
      // row and its allocations and before any rollback existed to undo them.
      // The guest really is provisioned; adopting the row is the honest answer.
      const existing = await tx
        .select({ id: servers.id, userId: servers.userId })
        .from(servers)
        .where(
          and(eq(servers.proxmoxNodeId, proxmoxNodeId), eq(servers.vmid, vmid)),
        )
        .limit(1)
        .then(([row]) => row);

      if (existing) {
        if (existing.userId !== userId) {
          // Not a retry. A vmid that has been reused while somebody else's
          // server still holds it is a bug upstream, and writing anything here
          // would hand one customer another customer's machine.
          throw new FatalError(
            `Guest ${vmid} on node ${proxmoxNodeId} already belongs to another account.`,
          );
        }

        return { serverId: existing.id };
      }

      const created = await tx
        .insert(servers)
        .values({
          userId,
          vmid,
          name,
          serverPlanId,
          serverPlanPriceId,
          proxmoxNodeId,
          proxmoxTemplateId,
          installedAt: sql`now()`,
          terminatesAt: sql`now() + INTERVAL '1 month'`,
          suspendedAt: null,
          renewalReminderSentAt: null,
        })
        .returning({
          id: servers.id,
        })
        .then(([row]) => row);

      if (!created) {
        throw new FatalError("Failed to store provisioned server.");
      }

      await tx.insert(subnetAllocations).values(
        allocations.map((allocation) => ({
          subnetId: allocation,
          serverId: created.id,
        })),
      );

      return {
        serverId: created.id,
      };
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  revalidateCheckout();

  return {
    serverId: result.serverId,
  };
}

export async function rollbackStoreProvisionedServerStep({
  serverId,
}: {
  serverId: string;
}) {
  "use step";

  await db.transaction(
    async (tx) => {
      // [!] Order matters, and so does `deallocated_at`.
      //
      // `subnet_allocations.server_id` cascades from `servers`, so issuing
      // these two together left the outcome to whichever query the driver sent
      // first: detach-then-delete keeps the rows, delete-then-detach destroys
      // them. Detaching first is the one that keeps the record of which address
      // was handed out when, which has an abuse-handling basis of its own.
      //
      // Keeping the row is only safe with `deallocated_at` set.
      // `getAvailableSubnet` treats every allocation whose `deallocated_at` is
      // null as taken, so a row detached from its server but never deallocated
      // holds the subnet out of the pool for good - an address leaked by a
      // provision that failed, which is the case this step exists to clean up.
      await tx
        .update(subnetAllocations)
        .set({
          deallocatedAt: sql`now()`,
          serverId: null,
        })
        .where(eq(subnetAllocations.serverId, serverId));

      await tx.delete(servers).where(eq(servers.id, serverId));
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  revalidateCheckout();
}
