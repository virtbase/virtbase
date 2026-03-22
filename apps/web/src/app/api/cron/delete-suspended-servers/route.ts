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

import { deleteServerWorkflow } from "@virtbase/api/workflows";
import { and, eq, gt, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes, servers } from "@virtbase/db/schema";
import { SERVER_DELETION_GRACE_PERIOD_DAYS } from "@virtbase/utils";
import type { NextRequest } from "next/server";
import { start } from "workflow/api";

/**
 * Checks for suspended servers that are past the deletion grace
 * period and queues them for deletion.
 */
async function handler(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  console.log(
    "[CRON] Starting deletion of suspended servers. Current time is:",
    new Date().toISOString(),
  );

  const suspendedServers = await db.transaction(
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
        .where(
          and(
            gt(
              sql`DATE_TRUNC('day', now())`,
              sql`(DATE_TRUNC('day', ${servers.suspendedAt}) + INTERVAL '${sql.raw(`${SERVER_DELETION_GRACE_PERIOD_DAYS}`)} days')`,
            ),
          ),
        );
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  console.log(
    "[CRON] Found",
    suspendedServers.length,
    "suspended servers to delete.",
  );

  await Promise.all(
    suspendedServers.map(({ proxmoxNode, ...server }) =>
      start(deleteServerWorkflow, [
        {
          vmid: server.vmid,
          serverId: server.id,
          proxmoxNode,
        },
      ]),
    ),
  );

  return new Response("OK", {
    status: 200,
  });
}

export { handler as GET };
