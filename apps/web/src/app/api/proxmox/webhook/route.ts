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

import { and, eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes, servers } from "@virtbase/db/schema";
import { safeSecretCompare } from "@virtbase/utils";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as z from "zod";
import { env } from "@/env";

const schema = z.object({
  vmid: z.coerce.number().int().positive(),
  phase: z.enum(["pre-start", "post-start", "pre-stop", "post-stop"]),
  node: z.hostname(),
});

/**
 * Webhook handler triggered by Proxmox VE hook scripts.
 * Handles events for `pre-start`, `post-start`, `pre-stop`, and `post-stop`.
 */
async function handler(request: NextRequest) {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Cron secret is not configured", issues: [] },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${env.CRON_SECRET}`;
  if (!safeSecretCompare(authHeader, expected)) {
    return NextResponse.json(
      { error: "Unauthorized", issues: [] },
      { status: 401 },
    );
  }

  const body = await request.json();

  const { success, data, error } = await schema.safeParseAsync(body);
  if (!success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: error.issues },
      { status: 400 },
    );
  }

  const { vmid, phase, node } = data;

  switch (phase) {
    case "pre-start":
      break;
    case "post-start": {
      // Update the servers current node after it has started successfully.
      // This event is also fired for any live migrations of the server.
      await db.transaction(
        async (tx) => {
          const proxmoxNode = await tx
            .select({
              id: proxmoxNodes.id,
            })
            .from(proxmoxNodes)
            .where(eq(proxmoxNodes.hostname, node))
            .limit(1)
            .then(([row]) => row);

          if (!proxmoxNode) {
            // Proxmox node does not exist, ignore.
            console.warn(
              `[@virtbase/web] Proxmox node "${node}" does not exist, ignoring webhook for guest ${vmid} on phase "${phase}".`,
            );
            return;
          }

          const matches = await tx
            .update(servers)
            .set({ proxmoxNodeId: proxmoxNode.id })
            .where(and(eq(servers.vmid, vmid)))
            .returning({ id: servers.id });

          if (!matches.length) {
            // Server does not exist, ignore.
            console.warn(
              `[@virtbase/web] Server with VM ID "${vmid}" does not exist, ignoring webhook for guest ${vmid} on phase "${phase}".`,
            );
            return;
          }

          if (matches.length > 1) {
            // Multiple servers found with same VM ID
            console.error(
              `[@virtbase/web] Multiple servers found with same VM ID "${vmid}" on Proxmox node "${node}".`,
            );
            tx.rollback();
          }
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );

      break;
    }
    case "pre-stop":
      break;
    case "post-stop":
      break;
    default:
      return NextResponse.json(
        { error: "Unhandled phase", issues: [] },
        { status: 400 },
      );
  }

  return new Response("OK", { status: 200 });
}

export { handler as POST };
