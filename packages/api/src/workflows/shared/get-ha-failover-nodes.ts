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

import { and, eq, ne, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes } from "@virtbase/db/schema";

/**
 * Maximum number of additional nodes from the same node group that we list as
 * HA failover targets. Proxmox HA node-affinity rules support an arbitrary
 * number of nodes, but keeping the list short avoids surprising failovers to
 * far-away or rarely-used hardware and keeps the generated rule readable.
 */
const MAX_HA_FAILOVER_NODES = 5;

type GetHAFailoverNodesStepParams = {
  /**
   * The Proxmox VE node group that the primary node belongs to. Only nodes
   * within this group will be considered as failover targets (HA requires all
   * nodes to share a corosync cluster, which we model 1:1 with node groups).
   */
  proxmoxNodeGroupId: string;
  /**
   * Hostname of the primary node, which is excluded from the failover list.
   */
  excludeHostname: string;
};

/**
 * Selects up to {@link MAX_HA_FAILOVER_NODES} sibling Proxmox nodes from the
 * same node group as the primary node. Returned hostnames are intended to be
 * passed as the `nodes` argument to {@link updateHASettingsStep} so the HA
 * node-affinity rule can fail the VM over to them if the primary goes down.
 *
 * Nodes are sampled randomly so failover targets are spread across the group
 * rather than always pointing at the same handful of sibling nodes.
 */
export async function getHAFailoverNodesStep({
  proxmoxNodeGroupId,
  excludeHostname,
}: GetHAFailoverNodesStepParams): Promise<{ hostnames: string[] }> {
  "use step";

  const rows = await db.transaction(
    async (tx) => {
      return tx
        .select({ hostname: proxmoxNodes.hostname })
        .from(proxmoxNodes)
        .where(
          and(
            eq(proxmoxNodes.proxmoxNodeGroupId, proxmoxNodeGroupId),
            ne(proxmoxNodes.hostname, excludeHostname),
          ),
        )
        .orderBy(sql`random()`)
        .limit(MAX_HA_FAILOVER_NODES);
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  return {
    hostnames: rows.map((row) => row.hostname),
  };
}
