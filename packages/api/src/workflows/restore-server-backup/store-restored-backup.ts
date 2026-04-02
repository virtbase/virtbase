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
import { servers } from "@virtbase/db/schema";

type StoreRestoredBackupStepParams = {
  serverId: string;
  proxmoxTemplateId: string | null;
};

export async function storeRestoredBackupStep({
  serverId,
  proxmoxTemplateId,
}: StoreRestoredBackupStepParams) {
  "use step";

  await db.transaction(
    async (tx) => {
      await tx
        .update(servers)
        .set({
          proxmoxTemplateId,
          installedAt: sql`now()`,
        })
        .where(eq(servers.id, serverId));
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
}

export async function rollbackStoreRestoredBackupStep({
  serverId,
  previousProxmoxTemplateId,
}: {
  serverId: string;
  previousProxmoxTemplateId: string | null;
}) {
  "use step";

  await db.transaction(
    async (tx) => {
      await tx
        .update(servers)
        .set({
          proxmoxTemplateId: previousProxmoxTemplateId,
          installedAt: null,
        })
        .where(eq(servers.id, serverId));
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
}
