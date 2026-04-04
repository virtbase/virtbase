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

import { getProxmoxInstance } from "@virtbase/api/proxmox";
import { and, eq, gt, inArray, isNull, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes, servers, users } from "@virtbase/db/schema";
import { sendBatchEmail } from "@virtbase/email";
import ServerSuspended from "@virtbase/email/templates/server-suspended";
import { getEmailTitle } from "@virtbase/email/translations";
import type { NextRequest } from "next/server";

/**
 * Checks for terminated servers, marks them as suspended
 * and shuts them down.
 */
async function handler(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

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
        gt(
          sql`DATE_TRUNC('day', now())`,
          sql`DATE_TRUNC('day', ${servers.terminatesAt})`,
        ),
        isNull(servers.suspendedAt),
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
      // This change is asynchronous and applied after the shutdown operation.
      await Promise.all(
        servers.map(async (server) => {
          const vm = instance.node.qemu.$(server.vmid);
          await vm.config.$post({
            onboot: false,
          });
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

  await sendBatchEmail(
    await Promise.all(
      notificationTargets.map(async ({ user, ...server }) => ({
        to: user.email,
        subject: await getEmailTitle("server-suspended", user.locale),
        react: ServerSuspended({
          serverName: server.serverName,
          serverId: server.serverId,
          name: user.name,
          email: user.email,
          locale: user.locale,
        }),
      })),
    ),
  );

  return new Response("OK", {
    status: 200,
  });
}

export { handler as GET };
