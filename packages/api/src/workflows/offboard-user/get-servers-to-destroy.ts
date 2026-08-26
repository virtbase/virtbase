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
import { proxmoxNodes, servers } from "@virtbase/db/schema";

type GetServersToDestroyStepParams = {
  userId: string;
};

/**
 * Every server the account still owns, with the credentials needed to destroy
 * it.
 *
 * Read as one step rather than looked up per server so the workflow holds a
 * fixed list: the account is already locked by this point, so nothing can add
 * to it, and a replay destroys exactly the same set.
 */
export async function getServersToDestroyStep({
  userId,
}: GetServersToDestroyStepParams) {
  "use step";

  return db.transaction(
    async (tx) => {
      return tx
        .select({
          id: servers.id,
          vmid: servers.vmid,
          proxmoxNode: {
            hostname: proxmoxNodes.hostname,
            fqdn: proxmoxNodes.fqdn,
            // [!] Sensitive data
            tokenID: proxmoxNodes.tokenID,
            tokenSecret: proxmoxNodes.tokenSecret,
          },
        })
        .from(servers)
        .innerJoin(proxmoxNodes, eq(servers.proxmoxNodeId, proxmoxNodes.id))
        .where(eq(servers.userId, userId));
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );
}
