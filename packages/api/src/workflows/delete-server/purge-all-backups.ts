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
import { serverBackups } from "@virtbase/db/schema";
import type { GetProxmoxInstanceParams } from "../../proxmox/get-proxmox-instance";
import { getProxmoxInstance } from "../../proxmox/get-proxmox-instance";

type PurgeAllBackupsStepParams = {
  proxmoxNode: GetProxmoxInstanceParams;
  serverId: string;
};

export async function purgeAllBackupsStep({
  proxmoxNode,
  serverId,
}: PurgeAllBackupsStepParams) {
  "use step";

  const { node } = getProxmoxInstance(proxmoxNode);

  await db.transaction(
    async (tx) => {
      const backups = await tx
        .select({
          volid: serverBackups.volid,
          isLocked: serverBackups.isLocked,
        })
        .from(serverBackups)
        .where(eq(serverBackups.serverId, serverId));

      // Delete the backups
      await Promise.all(
        backups.map(async (backup) => {
          if (!backup.volid) {
            return;
          }

          const [storage] = backup.volid.split(":");
          if (!storage) {
            return;
          }

          await node.storage.$(storage).content.$(backup.volid).$put({
            protected: false,
            notes: "Safe to delete - server has been deleted",
          });

          await node.storage.$(storage).content.$(backup.volid).$delete();
        }),
      );

      // Delete all backups for the server
      await tx
        .delete(serverBackups)
        .where(eq(serverBackups.serverId, serverId));
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
}
