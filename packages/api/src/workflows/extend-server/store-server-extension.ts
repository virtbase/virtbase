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
import { proxmoxNodes, servers, users } from "@virtbase/db/schema";
import { FatalError } from "workflow";

type StoreServerExtensionStepParams = {
  serverId: string;
};

export async function storeServerExtensionStep(
  params: StoreServerExtensionStepParams,
) {
  "use step";

  const { serverId } = params;

  const result = await db.transaction(
    async (tx) => {
      const server = await tx
        .select({
          vmid: servers.vmid,
          name: servers.name,
          proxmoxNode: {
            hostname: proxmoxNodes.hostname,
            fqdn: proxmoxNodes.fqdn,
            // [!] Sensitive data
            tokenID: proxmoxNodes.tokenID,
            tokenSecret: proxmoxNodes.tokenSecret,
          },
          user: {
            name: users.name,
            email: users.email,
            locale: users.locale,
          },
        })
        .from(servers)
        .innerJoin(proxmoxNodes, eq(servers.proxmoxNodeId, proxmoxNodes.id))
        .innerJoin(users, eq(servers.userId, users.id))
        .where(eq(servers.id, serverId))
        .limit(1)
        .then(([row]) => row);

      if (!server) {
        throw new FatalError(
          `Failed to extend server. Server not found. ID: ${serverId}`,
        );
      }

      const updated = await tx
        .update(servers)
        .set({
          // If server was previously suspended, unsuspend it
          // User is allowed to start the server again
          suspendedAt: null,
          // Add exactly one month to the termination date
          terminatesAt: sql`CASE WHEN ${servers.terminatesAt} IS NULL THEN NULL ELSE ${servers.terminatesAt} + INTERVAL '1 month' END`,
          // Reset renewal reminder sent at
          renewalReminderSentAt: null,
        })
        .where(eq(servers.id, serverId))
        .returning({
          newTerminatesAt: servers.terminatesAt,
        })
        .then(([row]) => row);

      if (!updated) {
        throw new FatalError(`Failed to update server. ID: ${serverId}`);
      }

      const { proxmoxNode, user, ...rest } = server;

      return {
        server: rest,
        proxmoxNode,
        user,
        newTerminatesAt: updated.newTerminatesAt,
      };
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  return {
    ...result,
  };
}

export function rollbackStoreServerExtensionStep(
  params: StoreServerExtensionStepParams,
) {
  "use step";

  const { serverId } = params;

  return db.transaction(
    async (tx) => {
      await tx
        .update(servers)
        .set({
          suspendedAt: sql`now()`,
          terminatesAt: sql`CASE WHEN ${servers.terminatesAt} IS NULL THEN NULL ELSE ${servers.terminatesAt} - INTERVAL '1 month' END`,
          renewalReminderSentAt: sql`now()`,
        })
        .where(eq(servers.id, serverId));
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
}
