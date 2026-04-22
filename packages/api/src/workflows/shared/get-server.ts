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

import { eq, getTableColumns } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes, servers, users } from "@virtbase/db/schema";
import { FatalError } from "workflow";

type GetServerStepParams = {
  serverId: string;
};

export async function getServerStep({ serverId }: GetServerStepParams) {
  "use step";

  const owner = await db.transaction(
    async (tx) => {
      const columns = getTableColumns(servers);

      return tx
        .select({
          ...columns,
          proxmoxNode: {
            id: proxmoxNodes.id,
            hostname: proxmoxNodes.hostname,
            fqdn: proxmoxNodes.fqdn,
            tokenID: proxmoxNodes.tokenID,
            tokenSecret: proxmoxNodes.tokenSecret,
            backupStorage: proxmoxNodes.backupStorage,
          },
          user: {
            name: users.name,
            email: users.email,
            locale: users.locale,
          },
        })
        .from(servers)
        .innerJoin(users, eq(servers.userId, users.id))
        .innerJoin(proxmoxNodes, eq(servers.proxmoxNodeId, proxmoxNodes.id))
        .where(eq(servers.id, serverId))
        .limit(1)
        .then(([res]) => res);
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  if (!owner) {
    throw new FatalError(
      `The server with ID "${serverId}" was not found. Cannot get server.`,
    );
  }

  return owner;
}
