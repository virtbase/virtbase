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

import { and, eq, isNull } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import { serverBackups } from "@virtbase/db/schema";
import type { ProxmoxInstance } from "../proxmox";
import { reconcileServerBackup } from "./reconcile-backup";

type Database = typeof database;

export interface ReconcileServerBackupsParams {
  db: Database;
  instance: ProxmoxInstance;
  backupStorage: string;
  vmid: number;
  serverId: string;
}

/**
 * Settles every outstanding backup of a single server.
 *
 * Backups are otherwise only reconciled while a customer watches the backups
 * page. Calling this before an action that depends on the backup state lets
 * that action recover on its own instead of failing forever on a row that
 * nobody ever finished.
 */
export async function reconcileServerBackups({
  db,
  serverId,
  ...params
}: ReconcileServerBackupsParams) {
  const unsettled = await db.transaction(
    async (tx) => {
      return tx
        .select({
          id: serverBackups.id,
          serverId: serverBackups.serverId,
          upid: serverBackups.upid,
          startedAt: serverBackups.startedAt,
          failedAt: serverBackups.failedAt,
          finishedAt: serverBackups.finishedAt,
        })
        .from(serverBackups)
        .where(
          and(
            // [!] Authorization: Only touch backups of the given server
            eq(serverBackups.serverId, serverId),
            isNull(serverBackups.finishedAt),
          ),
        );
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  // Runs sequentially: a server has at most one outstanding backup in
  // practice, and serialising keeps the load on the node predictable.
  for (const backup of unsettled) {
    await reconcileServerBackup({ ...params, db, backup });
  }
}
