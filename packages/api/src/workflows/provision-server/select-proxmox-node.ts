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

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  isNull,
  lte,
  or,
  sql,
} from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxNodeGroups,
  proxmoxNodes,
  serverPlans,
  servers,
} from "@virtbase/db/schema";
import { FatalError, getStepMetadata, RetryableError } from "workflow";
import { getProxmoxInstance } from "../../proxmox";

type SelectProxmoxNodeStepParams = {
  serverPlanId: string;
};

export async function selectProxmoxNodeStep({
  serverPlanId,
}: SelectProxmoxNodeStepParams) {
  "use step";

  const plan = await db.transaction(
    async (tx) => {
      return tx
        .select({
          cores: serverPlans.cores,
          memory: serverPlans.memory,
          storage: serverPlans.storage,
          netrate: serverPlans.netrate,
          strategy: proxmoxNodeGroups.strategy,
          proxmoxNodeGroupId: proxmoxNodeGroups.id,
        })
        .from(serverPlans)
        .innerJoin(
          proxmoxNodeGroups,
          eq(serverPlans.proxmoxNodeGroupId, proxmoxNodeGroups.id),
        )
        .where(eq(serverPlans.id, serverPlanId))
        .limit(1)
        .then(([res]) => res);
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  if (!plan) {
    throw new FatalError(
      `The server plan with ID "${serverPlanId}" does not exist. Cannot select Proxmox node.`,
    );
  }

  const { cores, memory, storage, netrate, strategy, proxmoxNodeGroupId } =
    plan;

  const sharedColumns = {
    id: proxmoxNodes.id,
    hostname: proxmoxNodes.hostname,
    fqdn: proxmoxNodes.fqdn,
    tokenID: proxmoxNodes.tokenID,
    tokenSecret: proxmoxNodes.tokenSecret,
  };

  const usageSubquery = db
    .select({
      proxmoxNodeId: servers.proxmoxNodeId,
      serversCount: count(servers.id).as("servers_count"),
      usedCores: sql<number>`COALESCE(SUM(${serverPlans.cores}), 0)`.as(
        "used_cores",
      ),
      usedMemory: sql<number>`COALESCE(SUM(${serverPlans.memory}), 0)`.as(
        "used_memory",
      ),
      usedStorage: sql<number>`COALESCE(SUM(${serverPlans.storage}), 0)`.as(
        "used_storage",
      ),
      usedNetrate: sql<number>`COALESCE(SUM(${serverPlans.netrate}), 0)`.as(
        "used_netrate",
      ),
    })
    .from(servers)
    .innerJoin(serverPlans, eq(servers.serverPlanId, serverPlans.id))
    .groupBy(servers.proxmoxNodeId)
    .as("usage");

  // General selection criteria applied to all strategies
  // Check for coresLimit, memoryLimit, storageLimit, netrateLimit, guestLimit
  const where = and(
    // Node must be in the same group
    eq(proxmoxNodes.proxmoxNodeGroupId, proxmoxNodeGroupId),
    or(
      // Node must have enough cores
      isNull(proxmoxNodes.coresLimit),
      lte(
        sql`(${usageSubquery.usedCores} + ${cores})`,
        proxmoxNodes.coresLimit,
      ),
    ),
    or(
      // Node must have enough memory
      isNull(proxmoxNodes.memoryLimit),
      lte(
        sql`(${usageSubquery.usedMemory} + ${memory})`,
        proxmoxNodes.memoryLimit,
      ),
    ),
    or(
      // Node must have enough storage
      isNull(proxmoxNodes.storageLimit),
      lte(
        sql`(${usageSubquery.usedStorage} + ${storage})`,
        proxmoxNodes.storageLimit,
      ),
    ),
    or(
      // Node must have enough network rate
      isNull(proxmoxNodes.netrateLimit),
      lte(
        sql`(${usageSubquery.usedNetrate} + ${netrate})`,
        proxmoxNodes.netrateLimit,
      ),
    ),
    or(
      // Node must not have reached the guest limit
      isNull(proxmoxNodes.guestLimit),
      lte(sql`(${usageSubquery.serversCount} + 1)`, proxmoxNodes.guestLimit),
    ),
  );

  const combinedUsage = sql`(${usageSubquery.usedCores} + ${usageSubquery.usedMemory} + ${usageSubquery.usedStorage} + ${usageSubquery.usedNetrate})`;

  let selectedNode:
    | Pick<
        typeof proxmoxNodes.$inferSelect,
        "id" | "hostname" | "fqdn" | "tokenID" | "tokenSecret"
      >
    | undefined;
  switch (strategy) {
    case "RANDOM":
      selectedNode = await db.transaction(
        async (tx) => {
          return tx
            .select(sharedColumns)
            .from(proxmoxNodes)
            .leftJoin(
              usageSubquery,
              eq(proxmoxNodes.id, usageSubquery.proxmoxNodeId),
            )
            .where(where)
            .orderBy(sql`random()`) // Randomly select any node with resources
            .limit(1)
            .then(([res]) => res);
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );
      break;
    case "ROUND_ROBIN":
      selectedNode = await db.transaction(
        async (tx) => {
          const latestServer = await tx
            .select({
              latestProxmoxNodeId: servers.proxmoxNodeId,
            })
            .from(servers)
            .innerJoin(proxmoxNodes, eq(servers.proxmoxNodeId, proxmoxNodes.id))
            .orderBy(desc(servers.id))
            .limit(1)
            .then(([res]) => res);

          let result = await tx
            .select(sharedColumns)
            .from(proxmoxNodes)
            .leftJoin(
              usageSubquery,
              eq(proxmoxNodes.id, usageSubquery.proxmoxNodeId),
            )
            .where(
              and(
                where,
                latestServer
                  ? // Get next node in order after the latest server
                    gt(proxmoxNodes.id, latestServer.latestProxmoxNodeId)
                  : undefined,
              ),
            )
            .orderBy(asc(proxmoxNodes.id)) // Required to follow round-robin order
            .limit(1)
            .then(([res]) => res);

          if (!result) {
            // round-robin order is complete or no latest server exists, start over from the beginning
            result = await tx
              .select(sharedColumns)
              .from(proxmoxNodes)
              .leftJoin(
                usageSubquery,
                eq(proxmoxNodes.id, usageSubquery.proxmoxNodeId),
              )
              .where(where)
              .orderBy(asc(proxmoxNodes.id))
              .limit(1)
              .then(([res]) => res);
          }

          return result;
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );
      break;
    case "LEAST_USED":
      selectedNode = await db.transaction(
        async (tx) => {
          return tx
            .select(sharedColumns)
            .from(proxmoxNodes)
            .leftJoin(
              usageSubquery,
              eq(proxmoxNodes.id, usageSubquery.proxmoxNodeId),
            )
            .where(where)
            .orderBy(
              asc(combinedUsage),
              // If there are multiple nodes with the same usage, select the one with the lowest ID
              asc(proxmoxNodes.id),
            ) // Least used node
            .limit(1)
            .then(([res]) => res);
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );
      break;
    case "FILL":
      selectedNode = await db.transaction(
        async (tx) => {
          return tx
            .select(sharedColumns)
            .from(proxmoxNodes)
            .leftJoin(
              usageSubquery,
              eq(proxmoxNodes.id, usageSubquery.proxmoxNodeId),
            )
            .where(where)
            .orderBy(
              desc(combinedUsage),
              // If there are multiple nodes with the same usage, select the one with the lowest ID
              asc(proxmoxNodes.id),
            ) // Most used node
            .limit(1)
            .then(([res]) => res);
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );
      break;
    default:
      throw new FatalError(
        `Invalid Proxmox node group strategy: ${strategy}. Cannot provision server.`,
      );
  }

  if (!selectedNode) {
    throw new FatalError(
      `No Proxmox node was found that matches the selection criteria. Cannot provision server. Strategy: ${strategy}`,
    );
  }

  // Check node availability
  const { node } = getProxmoxInstance(selectedNode);
  const { attempt } = getStepMetadata();

  try {
    await node.status.$get();
  } catch {
    throw new RetryableError(
      `The Proxmox node "${selectedNode.hostname}" is currently not reachable. Deferring...`,
      {
        // 1: 1 minute 2: 4 minutes 3: 9 minutes 4: 16 minutes, max 60 minutes
        retryAfter: Math.min(attempt * 1000 * 60 ** 2, 60 * 1000 * 60),
      },
    );
  }

  return {
    selectedNode,
    plan,
  };
}
