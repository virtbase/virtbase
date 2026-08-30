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
import { getProxmoxInstance } from "@virtbase/api/proxmox";
import { and, eq, gte, inArray, isNotNull, isNull, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes, servers, users } from "@virtbase/db/schema";
import { sendBatchEmail } from "@virtbase/email";
import ServerSuspended from "@virtbase/email/templates/server-suspended";
import { getEmailTitle } from "@virtbase/email/translations";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Checks for terminated servers, marks them as suspended
 * and shuts them down.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting suspension of terminated servers. Current time is:",
    new Date().toISOString(),
  );

  const nodesWithTerminatedServers = await db
    .select({
      proxmoxNodeId: proxmoxNodes.id,
      hostname: proxmoxNodes.hostname,
      fqdn: proxmoxNodes.fqdn,
      tokenID: proxmoxNodes.tokenID,
      tokenSecret: proxmoxNodes.tokenSecret,
      servers: sql<{ id: string; vmid: number }[]>`
      COALESCE(
        json_agg(
          json_build_object(
            'id', ${servers.id},
            'vmid', ${servers.vmid}
          )
        ),
        '[]'::json
      )
    `.as("servers"),
    })
    .from(servers)
    .innerJoin(proxmoxNodes, eq(servers.proxmoxNodeId, proxmoxNodes.id))
    .where(
      and(
        isNotNull(servers.terminatesAt),
        isNull(servers.suspendedAt),
        gte(sql`now()`, servers.terminatesAt),
      ),
    )
    .groupBy(proxmoxNodes.id);

  console.log(
    "[CRON] Found",
    nodesWithTerminatedServers.length,
    "nodes with terminated servers to suspend.",
  );

  const promises = nodesWithTerminatedServers.map(
    async ({ servers, ...node }) => {
      const instance = getProxmoxInstance(node);

      // Update all servers to not boot if host is rebooted
      // This change is synchronous and applied before the shutdown operation.
      await Promise.all(
        servers.map(async (server) => {
          try {
            const vm = instance.node.qemu.$(server.vmid);
            await vm.config.$put({
              onboot: false,
            });
          } catch (error) {
            console.error(error);
            Sentry.captureException(error);
          }
        }),
      );

      // Shutdown all servers (async operation)
      await instance.cluster["bulk-action"].guest.shutdown.$post({
        vms: servers.map((server) => server.vmid),
        "force-stop": true,
        maxworkers: 10,
      });
    },
  );

  await Promise.all(promises);

  const terminatedServerIds = nodesWithTerminatedServers.flatMap(
    ({ servers }) => servers.map((server) => server.id),
  );

  await db.transaction(
    async (tx) => {
      await tx
        .update(servers)
        .set({
          suspendedAt: sql`now()`,
        })
        .where(inArray(servers.id, terminatedServerIds));
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  const notificationTargets = await db.transaction(
    async (tx) => {
      return tx
        .select({
          serverName: servers.name,
          serverId: servers.id,
          user: {
            name: users.name,
            email: users.email,
            locale: users.locale,
          },
        })
        .from(servers)
        .innerJoin(users, eq(servers.userId, users.id))
        .where(inArray(servers.id, terminatedServerIds));
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  // The suspensions are already committed, and a suspended server is not a
  // candidate on the next run - so failing the request here would lose these
  // notices for good and report a run that did most of its work as a failure.
  // `sendBatchEmail` rejects on a provider failure, so report and carry on.
  try {
    await sendBatchEmail(
      await Promise.all(
        notificationTargets.map(async ({ user, ...server }) => ({
          to: user.email,
          subject: await getEmailTitle("server-suspended", user.locale),
          react: await ServerSuspended({
            serverName: server.serverName,
            serverId: server.serverId,
            name: user.name,
            email: user.email,
            locale: user.locale,
          }),
        })),
      ),
    );
  } catch (error) {
    console.error(
      "[CRON] Failed to send",
      notificationTargets.length,
      "suspension notice(s): ",
      error,
    );
    Sentry.captureException(error);
  }

  return new Response("OK", {
    status: 200,
  });
});

export { handler as GET };
