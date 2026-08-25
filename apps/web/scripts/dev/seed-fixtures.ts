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

import { db } from "@virtbase/db/client";
import {
  proxmoxNodes,
  serverPlanPrices,
  serverPlans,
  subnets,
  subnetsToProxmoxNodes,
} from "@virtbase/db/schema";

/**
 * Deterministic plans, prices and IP space for the development database.
 *
 * Written by hand rather than through `drizzle-seed` because these rows have to
 * be *correct and linked*, not merely present. The generated version produced
 * none of them: `subnets` was listed in `refine` but missing from the schema map
 * so it was silently ignored, and `serverPlans` was declared both as a `with:`
 * child of `proxmoxNodeGroups` and as a top-level entry, which yielded zero
 * rows. Explicit inserts are longer but they can be read and debugged.
 *
 * Everything uses fixed ids so a re-run updates in place instead of duplicating.
 */

/** The bridge every dockerised node exposes; see `tooling/proxmox-cluster`. */
const BRIDGE = "vmbr0";

/**
 * Addressing matches the node's own `vmbr0` (172.30.0.0/24, gateway .1) so an
 * allocated address is actually reachable from the guest, rather than a
 * plausible-looking range that routes nowhere.
 */
const IPV4_PARENT = "172.30.0.0/24";
const IPV4_GATEWAY = "172.30.0.1";
const IPV4_FIRST_HOST = 100;

const IPV6_PARENT = "fd00:1b:c0de::/48";
const IPV6_GATEWAY = "fd00:1b:c0de::1";

/** Addresses of each family. Plenty for development, small enough to scan. */
const ADDRESS_COUNT = 25;

const id = (prefix: string, n: number) =>
  `${prefix}${String(n).padStart(25, "0")}`;

export interface FixtureSummary {
  plans: number;
  prices: number;
  subnets: number;
  links: number;
}

export async function seedPlansAndNetworking(): Promise<FixtureSummary> {
  // Attach everything to the group the cluster nodes actually live in.
  // A plan on an empty group can never be provisioned.
  const nodes = await db
    .select({
      id: proxmoxNodes.id,
      groupId: proxmoxNodes.proxmoxNodeGroupId,
    })
    .from(proxmoxNodes);

  if (!nodes.length) {
    throw new Error(
      "no proxmox nodes found - run 'bun script dev/cluster' first",
    );
  }

  const groupId = nodes[0]?.groupId as string;

  // ------------------------------------------------------------- plans ----

  const planSpecs = [
    { name: "Nano", cores: 1, memory: 1024, storage: 10, price: 119 },
    { name: "Small", cores: 2, memory: 2048, storage: 25, price: 349 },
    { name: "Medium", cores: 4, memory: 4096, storage: 50, price: 699 },
    { name: "Large", cores: 6, memory: 8192, storage: 100, price: 1399 },
  ];

  for (const [index, spec] of planSpecs.entries()) {
    const planId = id("pck_", index + 1);
    const values = {
      proxmoxNodeGroupId: groupId,
      name: spec.name,
      cores: spec.cores,
      memory: spec.memory,
      storage: spec.storage,
      netrate: 125,
      price: spec.price,
      // Exactly one recommended plan: a partial unique index enforces that.
      recommended: spec.name === "Small",
    };

    await db
      .insert(serverPlans)
      .values({ id: planId, ...values })
      .onConflictDoUpdate({ target: serverPlans.id, set: values });

    // Without a price row the plan cannot be purchased, which is why checkout
    // showed nothing even when plans existed.
    const priceValues = {
      serverPlanId: planId,
      purchasePrice: spec.price,
      renewalPrice: spec.price,
    };

    await db
      .insert(serverPlanPrices)
      .values({ id: id("price_", index + 1), ...priceValues })
      .onConflictDoUpdate({
        target: serverPlanPrices.id,
        set: priceValues,
      });
  }

  // ----------------------------------------------------------- subnets ----

  // Parents are bookkeeping only - allocation looks for the exact prefix
  // lengths the provisioning workflow asks for, /32 and /64.
  const ipv4ParentId = id("ipsub_", 1);
  const ipv6ParentId = id("ipsub_", 2);

  for (const [parentId, cidr, gateway] of [
    [ipv4ParentId, IPV4_PARENT, IPV4_GATEWAY],
    [ipv6ParentId, IPV6_PARENT, IPV6_GATEWAY],
  ] as const) {
    await db
      .insert(subnets)
      .values({ id: parentId, cidr, gateway, vlan: 0 })
      .onConflictDoUpdate({
        target: subnets.id,
        set: { cidr, gateway, vlan: 0 },
      });
  }

  const children: Array<{
    id: string;
    cidr: string;
    gateway: string;
    parentId: string;
  }> = [];

  for (let n = 0; n < ADDRESS_COUNT; n++) {
    children.push({
      id: id("ipsub_", 100 + n),
      // `findFirstAvailableSubnet(4, 32, ...)` filters on `masklen = 32`, so
      // each usable address is its own /32 row.
      cidr: `172.30.0.${IPV4_FIRST_HOST + n}/32`,
      gateway: IPV4_GATEWAY,
      parentId: ipv4ParentId,
    });
    children.push({
      id: id("ipsub_", 200 + n),
      // ... and /64 for IPv6.
      cidr: `fd00:1b:c0de:${(n + 1).toString(16)}::/64`,
      gateway: IPV6_GATEWAY,
      parentId: ipv6ParentId,
    });
  }

  for (const child of children) {
    const values = {
      cidr: child.cidr,
      gateway: child.gateway,
      parentId: child.parentId,
      vlan: 0,
    };
    await db
      .insert(subnets)
      .values({ id: child.id, ...values })
      .onConflictDoUpdate({ target: subnets.id, set: values });
  }

  // ------------------------------------------------- subnets to nodes ----

  // Every address is offered on every node: allocation is guarded by
  // `subnet_allocations`, so linking widely cannot hand the same address out
  // twice, and it means any node can satisfy a request.
  let links = 0;
  for (const node of nodes) {
    for (const child of children) {
      await db
        .insert(subnetsToProxmoxNodes)
        .values({
          subnetId: child.id,
          proxmoxNodeId: node.id,
          bridge: BRIDGE,
        })
        .onConflictDoNothing();
      links++;
    }
  }

  return {
    plans: planSpecs.length,
    prices: planSpecs.length,
    subnets: children.length + 2,
    links,
  };
}
