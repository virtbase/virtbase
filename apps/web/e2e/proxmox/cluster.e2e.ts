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

import { expect, test } from "@playwright/test";
import { getProxmoxInstance } from "@virtbase/api/proxmox";
import type { ClusterConfig } from "../support/cluster";
import { clusterIsReachable, readClusterConfig } from "../support/cluster";

/**
 * Runs only against the local cluster from `tooling/proxmox-cluster`.
 *
 * Skipped rather than failed when it is absent: the cluster needs `/dev/kvm`,
 * nested virtualisation and several GB of RAM, none of which GitHub-hosted
 * runners guarantee. Bring it up with `./tooling/proxmox-cluster/bootstrap.sh`.
 */
let cluster: ClusterConfig | null = null;
let skipReason = "";

test.beforeAll(async () => {
  cluster = await readClusterConfig();

  if (!cluster) {
    skipReason =
      "no local Proxmox cluster - run ./tooling/proxmox-cluster/bootstrap.sh";
    return;
  }

  if (!(await clusterIsReachable(cluster))) {
    // Distinguished on purpose: a configured-but-unreachable cluster is nearly
    // always either stopped or a missing CA, and silently skipping in the second
    // case sends people hunting for a test bug that is not there.
    skipReason = process.env.NODE_EXTRA_CA_CERTS
      ? "cluster is configured but not answering - is it running?"
      : `cluster is configured but TLS is untrusted - export NODE_EXTRA_CA_CERTS=${cluster.caFile}`;
    cluster = null;
  }
});

test.beforeEach(() => {
  test.skip(!cluster, skipReason);
});

function instanceFor(hostname: string) {
  const config = cluster as ClusterConfig;
  return getProxmoxInstance({
    hostname,
    fqdn: config.fqdn,
    tokenID: config.tokenId,
    tokenSecret: config.tokenSecret,
  });
}

test.describe("proxmox cluster", () => {
  test("every seeded node answers through the shared entry point", async () => {
    const config = cluster as ClusterConfig;

    for (const node of config.nodes) {
      const status = await instanceFor(node.hostname).node.status.$get();
      expect(status.pveversion).toContain("pve-manager/9");
    }
  });

  test("the cluster is quorate", async () => {
    const config = cluster as ClusterConfig;
    const status = await instanceFor(
      config.nodes[0]?.hostname ?? "pve1",
    ).cluster.status.$get();

    const quorum = status.find((entry) => entry.type === "cluster");
    expect(quorum?.quorate).toBe(1);
    expect(quorum?.nodes).toBe(config.nodes.length);
  });

  test("iso, backup and snippet storage is shared across the cluster", async () => {
    const config = cluster as ClusterConfig;
    const storages = await instanceFor(
      config.nodes[0]?.hostname ?? "pve1",
    ).node.storage.$get();

    // The app assumes one ISO storage serves every node - see the TODO in
    // `packages/api/src/router/iso/index.ts`.
    for (const name of new Set([
      config.storage.iso,
      config.storage.backup,
      config.storage.snippet,
    ])) {
      const storage = storages.find((entry) => entry.storage === name);
      expect(storage, `storage ${name} is missing`).toBeDefined();
      expect(storage?.shared, `storage ${name} is not shared`).toBe(1);
    }
  });
});
