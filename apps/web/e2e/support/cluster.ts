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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface ClusterNode {
  hostname: string;
  ip: string;
}

export interface ClusterConfig {
  /** Entry point for every node: pveproxy forwards to the right member. */
  fqdn: string;
  tokenId: string;
  tokenSecret: string;
  caFile: string;
  storage: {
    vm: string;
    iso: string;
    backup: string;
    snippet: string;
    import: string;
  };
  nodes: ClusterNode[];
}

// Node APIs, not `import.meta.dir` / `Bun.file`: this module is loaded both by
// the bootstrap (bun) and by Playwright (node), and the Bun globals are
// undefined in the latter.
const CLUSTER_JSON = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../tooling/proxmox-cluster/cluster.json",
);

/**
 * The local Proxmox cluster, or null when it has not been bootstrapped.
 *
 * Absence is the normal case - the cluster needs `/dev/kvm` and several GB of
 * RAM, and GitHub-hosted runners have neither. Callers skip rather than fail.
 */
export async function readClusterConfig(): Promise<ClusterConfig | null> {
  let raw: string;
  try {
    raw = await readFile(CLUSTER_JSON, "utf8");
  } catch {
    return null;
  }

  const config = JSON.parse(raw) as ClusterConfig;
  return config.nodes?.length ? config : null;
}

/**
 * Whether the cluster is not just configured but actually answering.
 *
 * A stale `cluster.json` left behind by a `docker compose down` would otherwise
 * turn a skipped suite into a suite that fails on connection refused.
 */
export async function clusterIsReachable(
  config: ClusterConfig,
): Promise<boolean> {
  try {
    const response = await fetch(`https://${config.fqdn}/api2/json/version`, {
      headers: {
        Authorization: `PVEAPIToken=${config.tokenId}=${config.tokenSecret}`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
