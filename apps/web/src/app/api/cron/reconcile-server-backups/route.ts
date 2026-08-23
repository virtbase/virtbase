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

import * as Sentry from "@sentry/nextjs";
import { reconcileServerBackup } from "@virtbase/api/backups";
import { getProxmoxInstance } from "@virtbase/api/proxmox";
import { asc, eq, isNull } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes, serverBackups, servers } from "@virtbase/db/schema";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * The maximum number of backups settled per run. Reconciling one backup costs
 * up to two Proxmox calls, so this bounds the runtime of the route.
 */
const BATCH_SIZE = 200;

/**
 * Settles backups whose `vzdump` task has finished without anybody noticing.
 *
 * A backup is otherwise only reconciled while a customer watches the backups
 * page. Closing the tab before the task finishes used to leave the row
 * unfinished forever, which blocks every further backup of that server and
 * makes the row impossible to delete or restore.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting reconciliation of server backups. Current time is:",
    new Date().toISOString(),
  );

  const unsettled = await db.transaction(
    async (tx) => {
      return (
        tx
          .select({
            backup: {
              id: serverBackups.id,
              serverId: serverBackups.serverId,
              upid: serverBackups.upid,
              startedAt: serverBackups.startedAt,
              failedAt: serverBackups.failedAt,
              finishedAt: serverBackups.finishedAt,
            },
            vmid: servers.vmid,
            proxmoxNode: {
              hostname: proxmoxNodes.hostname,
              fqdn: proxmoxNodes.fqdn,
              // [!] Sensitive data
              tokenID: proxmoxNodes.tokenID,
              tokenSecret: proxmoxNodes.tokenSecret,
              backupStorage: proxmoxNodes.backupStorage,
            },
          })
          .from(serverBackups)
          .innerJoin(servers, eq(serverBackups.serverId, servers.id))
          .innerJoin(proxmoxNodes, eq(servers.proxmoxNodeId, proxmoxNodes.id))
          .where(isNull(serverBackups.finishedAt))
          // Oldest first - those are the ones at risk of never being settled
          .orderBy(asc(serverBackups.startedAt))
          .limit(BATCH_SIZE)
      );
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  console.log("[CRON] Found", unsettled.length, "unsettled backups.");

  // Group by node so that one unreachable node cannot starve the others:
  // nodes are reconciled in parallel, the backups of a node one after another.
  const byNode = new Map<string, typeof unsettled>();
  for (const row of unsettled) {
    const existing = byNode.get(row.proxmoxNode.fqdn);
    if (existing) {
      existing.push(row);
    } else {
      byNode.set(row.proxmoxNode.fqdn, [row]);
    }
  }

  const settled = await Promise.all(
    [...byNode.values()].map(async (rows) => {
      // Every row of a group shares the same node
      // biome-ignore lint/style/noNonNullAssertion: groups are never empty
      const instance = getProxmoxInstance(rows[0]!.proxmoxNode);

      let count = 0;

      // Sequential on purpose: a burst of parallel task lookups against a node
      // that is already busy writing backups helps nobody.
      for (const { backup, vmid, proxmoxNode } of rows) {
        try {
          const status = await reconcileServerBackup({
            db,
            instance,
            backupStorage: proxmoxNode.backupStorage,
            vmid,
            backup,
          });

          if (status.finishedAt) count++;
        } catch (error) {
          // Reconciliation swallows Proxmox failures itself, so this only
          // fires on unexpected errors - keep going with the remaining rows.
          console.error(error);
          Sentry.captureException(error);
        }
      }

      return count;
    }),
  ).then((counts) => counts.reduce((total, count) => total + count, 0));

  console.log("[CRON] Settled", settled, "backups.");

  return new Response("OK", {
    status: 200,
  });
});

export { handler as GET };
