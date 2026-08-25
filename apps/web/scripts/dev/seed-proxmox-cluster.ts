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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
} from "@virtbase/db/schema";
import { createId } from "@virtbase/db/utils";

interface ClusterConfig {
  fqdn: string;
  tokenId: string;
  tokenSecret: string;
  storage: { vm: string; iso: string; backup: string; snippet: string };
  nodes: Array<{ hostname: string; ip: string }>;
}

const CLUSTER_JSON = join(
  process.cwd(),
  "../../tooling/proxmox-cluster/cluster.json",
);

/**
 * Register the local Proxmox cluster as real `proxmox_nodes` rows.
 *
 * Without this the dev database has plans and datacenters but nowhere to put a
 * VM, so checkout offers everything as unavailable and provisioning cannot run.
 * Returns the number of nodes registered, or null when no cluster has been
 * bootstrapped - which is the normal case for someone who has not started it.
 */
export async function seedProxmoxCluster(): Promise<number | null> {
  let cluster: ClusterConfig;
  try {
    cluster = JSON.parse(await readFile(CLUSTER_JSON, "utf8"));
  } catch {
    return null;
  }

  if (!cluster.nodes?.length) {
    return null;
  }

  // Attach to whichever node group the seed created; the plans hang off it, and
  // a node in no group can host nothing.
  const [group] = await db
    .select({ id: proxmoxNodeGroups.id })
    .from(proxmoxNodeGroups)
    .limit(1);

  if (!group) {
    throw new Error(
      "no proxmox node group found - run the main seed before this one",
    );
  }

  // `datacenterId` is NOT NULL, so a node cannot exist without one.
  const [datacenter] = await db
    .select({ id: datacenters.id })
    .from(datacenters)
    .limit(1);

  if (!datacenter) {
    throw new Error("no datacenter found - run the main seed before this one");
  }

  for (const node of cluster.nodes) {
    const existing = await db
      .select({ id: proxmoxNodes.id })
      .from(proxmoxNodes)
      .where(eq(proxmoxNodes.hostname, node.hostname))
      .limit(1);

    const values = {
      proxmoxNodeGroupId: group.id,
      datacenterId: datacenter.id,
      hostname: node.hostname,
      // Every node is reached through the same published entry point; the
      // hostname selects the member and pveproxy forwards to it.
      fqdn: cluster.fqdn,
      tokenID: cluster.tokenId,
      tokenSecret: cluster.tokenSecret,
      cpuDescription: "Ceph-backed development node",
      memoryDescription: "Container memory",
      storageDescription: "Ceph RBD",
      netrate: 1000,
      // Generous enough that plan availability never blocks a dev flow.
      guestLimit: 100,
      memoryLimit: 65536,
      storageLimit: 1000,
      netrateLimit: 10000,
      coresLimit: 64,
      snippetStorage: cluster.storage.snippet,
      backupStorage: cluster.storage.backup,
      isoDownloadStorage: cluster.storage.iso,
    };

    if (existing[0]) {
      await db
        .update(proxmoxNodes)
        .set(values)
        .where(eq(proxmoxNodes.id, existing[0].id));
    } else {
      await db
        .insert(proxmoxNodes)
        .values({ id: createId({ prefix: "pn_" }), ...values });
    }
  }

  return cluster.nodes.length;
}
