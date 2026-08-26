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
import {
  isDetectionStale,
  refreshServerOperatingSystem,
} from "@virtbase/api/guest-os";
import { getProxmoxInstance } from "@virtbase/api/proxmox";
import { and, eq, isNotNull, isNull, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes, servers } from "@virtbase/db/schema";
import { mapProxmoxServerStatus, ProxmoxServerStatus } from "@virtbase/utils";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * The maximum number of servers inspected per run.
 *
 * Detecting one server costs two Proxmox calls - a status read and an agent
 * read - so this bounds the runtime of the route.
 */
const BATCH_SIZE = 200;

/**
 * Reads the operating system out of servers nobody is currently looking at.
 *
 * The dashboard refreshes detection on its own while a customer has a server
 * open, which covers the customer's own view but nothing else: the Discord
 * bot, the admin console and the servers list all read the stored value, and a
 * server whose owner never opens the web app would keep showing the template
 * it was provisioned from forever.
 *
 * Never-detected servers come first, then the ones detected longest ago, so a
 * fleet larger than one batch still converges rather than starving its tail.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting guest operating system detection. Current time is:",
    new Date().toISOString(),
  );

  const candidates = await db.transaction(
    async (tx) => {
      return (
        tx
          .select({
            server: {
              id: servers.id,
              vmid: servers.vmid,
              detectedOsAt: servers.detectedOsAt,
            },
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
          .where(
            // A server still installing has no operating system to report, and
            // a suspended one is not running.
            and(isNotNull(servers.installedAt), isNull(servers.suspendedAt)),
          )
          // Nulls first: a server that has never been detected is the one with
          // nothing at all to show.
          .orderBy(sql`${servers.detectedOsAt} ASC NULLS FIRST`)
          .limit(BATCH_SIZE)
      );
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  console.log("[CRON] Considering", candidates.length, "servers.");

  // Group by node so that one unreachable node cannot starve the others:
  // nodes are swept in parallel, the servers of a node one after another.
  const byNode = new Map<string, typeof candidates>();
  for (const row of candidates) {
    const existing = byNode.get(row.proxmoxNode.fqdn);
    if (existing) {
      existing.push(row);
    } else {
      byNode.set(row.proxmoxNode.fqdn, [row]);
    }
  }

  const detected = await Promise.all(
    [...byNode.values()].map(async (rows) => {
      // Every row of a group shares the same node
      // biome-ignore lint/style/noNonNullAssertion: groups are never empty
      const instance = getProxmoxInstance(rows[0]!.proxmoxNode);

      let count = 0;

      // Sequential on purpose: a burst of parallel agent calls against one
      // node helps nobody, and the guest agent is the slowest thing here.
      for (const { server } of rows) {
        try {
          const vm = instance.node.qemu.$(server.vmid);
          const status = await vm.status.current.$get();

          const running =
            mapProxmoxServerStatus(status) === ProxmoxServerStatus.RUNNING;

          // The same staleness rule the status endpoint applies, so a server
          // being watched in a browser is not probed twice for no reason.
          if (!isDetectionStale({ server, running, uptime: status.uptime })) {
            continue;
          }

          const result = await refreshServerOperatingSystem({
            db,
            vm,
            server,
          });

          if (result) count++;
        } catch (error) {
          // An unreachable node must never fail the run - the remaining
          // servers, on other nodes, still deserve their sweep.
          console.error(error);
          Sentry.captureException(error);
        }
      }

      return count;
    }),
  ).then((counts) => counts.reduce((total, count) => total + count, 0));

  console.log("[CRON] Detected", detected, "operating systems.");

  return new Response("OK", {
    status: 200,
  });
});

export { handler as GET };
