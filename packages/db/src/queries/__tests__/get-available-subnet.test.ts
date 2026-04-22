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
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

import {
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
  subnetAllocations,
  subnets,
  subnetsToProxmoxNodes,
} from "../../schema";
import type { TestDb } from "../../test-client";
import { createTestDb } from "../../test-client";

let testDb: TestDb;
let findFirstAvailableSubnet: typeof import("../get-available-subnet").findFirstAvailableSubnet;

const DATACENTER_ID = "dc_test";
const NODE_GROUP_ID = "png_test";
const PROXMOX_NODE_ID = "pn_test";
const BRIDGE = "vmbr0";

beforeAll(async () => {
  testDb = await createTestDb();
  mock.module("../../client", () => ({ db: testDb }));

  const mod = await import("../get-available-subnet");
  findFirstAvailableSubnet = mod.findFirstAvailableSubnet;

  await testDb.insert(datacenters).values({
    id: DATACENTER_ID,
    name: "Test DC",
    country: "DE",
  });
  await testDb.insert(proxmoxNodeGroups).values({
    id: NODE_GROUP_ID,
    name: "Test Group",
  });
  await testDb.insert(proxmoxNodes).values({
    id: PROXMOX_NODE_ID,
    datacenterId: DATACENTER_ID,
    proxmoxNodeGroupId: NODE_GROUP_ID,
    hostname: "test-node",
    fqdn: "test-node.example.com",
    tokenID: "api@pam!test",
    tokenSecret: "secret",
    snippetStorage: "local-lvm",
    backupStorage: "local-lvm",
  });
});

afterAll(async () => {
  await testDb.$client.close();
});

afterEach(async () => {
  await testDb.delete(subnetAllocations);
  await testDb.delete(subnetsToProxmoxNodes);
  await testDb.delete(subnets);
});

/**
 * Inserts a parent subnet, links it to the test Proxmox node, and returns its id.
 */
async function seedParent({
  cidr,
  gateway,
  vlan = 0,
}: {
  cidr: string;
  gateway: string;
  vlan?: number;
}) {
  const [row] = await testDb
    .insert(subnets)
    .values({ cidr, gateway, vlan })
    .returning({ id: subnets.id });
  if (!row) throw new Error("Failed to seed parent subnet");

  await testDb.insert(subnetsToProxmoxNodes).values({
    subnetId: row.id,
    proxmoxNodeId: PROXMOX_NODE_ID,
    bridge: BRIDGE,
  });

  return row.id;
}

/**
 * Inserts a child subnet under `parentId`, optionally marking it as allocated
 * so the "reuse free existing subnet" path in findFirstAvailableSubnet skips it.
 */
async function seedChild(
  parentId: string,
  cidr: string,
  gateway: string,
  { allocated = true }: { allocated?: boolean } = {},
) {
  const [row] = await testDb
    .insert(subnets)
    .values({ cidr, gateway, parentId })
    .returning({ id: subnets.id });
  if (!row) throw new Error("Failed to seed child subnet");

  await testDb.insert(subnetsToProxmoxNodes).values({
    subnetId: row.id,
    proxmoxNodeId: PROXMOX_NODE_ID,
    bridge: BRIDGE,
  });

  if (allocated) {
    await testDb
      .insert(subnetAllocations)
      .values({ subnetId: row.id, description: "test" });
  }

  return row.id;
}

describe("findFirstAvailableSubnet - IPv4 /32 host allocation", () => {
  test("returns first usable host, skipping network address", async () => {
    await seedParent({ cidr: "5.231.248.208/29", gateway: "5.231.248.1" });

    const result = await findFirstAvailableSubnet(4, 32, PROXMOX_NODE_ID);

    expect(result?.cidr).toBe("5.231.248.209/32");
  });

  test("skips the gateway address when it sits inside the parent", async () => {
    await seedParent({ cidr: "192.168.1.0/29", gateway: "192.168.1.1" });

    const result = await findFirstAvailableSubnet(4, 32, PROXMOX_NODE_ID);

    // .0 = network, .1 = gateway → first free is .2
    expect(result?.cidr).toBe("192.168.1.2/32");
  });

  test("skips over an allocated child and returns the next host", async () => {
    const parentId = await seedParent({
      cidr: "10.0.0.0/29",
      gateway: "10.0.0.254",
    });
    // .0 is network, so .1 would be first. Occupy .1 → expect .2.
    await seedChild(parentId, "10.0.0.1/32", "10.0.0.254");

    const result = await findFirstAvailableSubnet(4, 32, PROXMOX_NODE_ID);

    expect(result?.cidr).toBe("10.0.0.2/32");
  });

  test("handles gaps by returning the lowest unallocated host", async () => {
    const parentId = await seedParent({
      cidr: "10.0.0.0/29",
      gateway: "10.0.0.254",
    });
    // Occupy .1 and .3; .2 is the first gap.
    await seedChild(parentId, "10.0.0.1/32", "10.0.0.254");
    await seedChild(parentId, "10.0.0.3/32", "10.0.0.254");

    const result = await findFirstAvailableSubnet(4, 32, PROXMOX_NODE_ID);

    expect(result?.cidr).toBe("10.0.0.2/32");
  });

  test("skips a larger child that overlaps the candidate", async () => {
    const parentId = await seedParent({
      cidr: "10.0.0.0/24",
      gateway: "10.0.0.1",
    });
    // /29 at .0 occupies .0 – .7; first free /32 past it is .8.
    await seedChild(parentId, "10.0.0.0/29", "10.0.0.1");

    const result = await findFirstAvailableSubnet(4, 32, PROXMOX_NODE_ID);

    expect(result?.cidr).toBe("10.0.0.8/32");
  });

  test("returns null when every usable host in the parent is taken", async () => {
    const parentId = await seedParent({
      cidr: "10.0.0.0/30",
      gateway: "10.0.0.254",
    });
    // /30 = .0 (net), .1, .2, .3 (bcast). Only .1 and .2 are usable.
    await seedChild(parentId, "10.0.0.1/32", "10.0.0.254");
    await seedChild(parentId, "10.0.0.2/32", "10.0.0.254");

    const result = await findFirstAvailableSubnet(4, 32, PROXMOX_NODE_ID);

    expect(result).toBeNull();
  });
});

describe("findFirstAvailableSubnet - IPv4 subnet allocation (target /28)", () => {
  test("returns the parent network aligned to target prefix when empty", async () => {
    await seedParent({ cidr: "10.0.0.0/24", gateway: "10.0.0.1" });

    const result = await findFirstAvailableSubnet(4, 28, PROXMOX_NODE_ID);

    // Non-max target prefix → network/broadcast/gateway exclusions do not apply.
    expect(result?.cidr).toBe("10.0.0.0/28");
  });

  test("advances past an existing /28 child", async () => {
    const parentId = await seedParent({
      cidr: "10.0.0.0/24",
      gateway: "10.0.0.1",
    });
    await seedChild(parentId, "10.0.0.0/28", "10.0.0.1");

    const result = await findFirstAvailableSubnet(4, 28, PROXMOX_NODE_ID);

    expect(result?.cidr).toBe("10.0.0.16/28");
  });
});

describe("findFirstAvailableSubnet - IPv6", () => {
  test("/128 host allocation from a /56 parent returns the parent network", async () => {
    // This is the exact scenario from the production error: gateway lives
    // outside the /56, so it must not show up as an obstacle.
    await seedParent({
      cidr: "2a0d:c2c0:8:ff00::/56",
      gateway: "2a0d:c2c0:8::1",
    });

    const result = await findFirstAvailableSubnet(6, 128, PROXMOX_NODE_ID);

    expect(result?.cidr).toBe("2a0d:c2c0:8:ff00::/128");
  });

  test("/128 host allocation skips the gateway when it lives inside the parent", async () => {
    await seedParent({
      cidr: "2a0d:c2c0:8:ff00::/56",
      gateway: "2a0d:c2c0:8:ff00::1",
    });

    const result = await findFirstAvailableSubnet(6, 128, PROXMOX_NODE_ID);

    // :: is free, ::1 is gateway → next is ::2? Actually :: comes before ::1,
    // and :: is not the gateway, so :: wins.
    expect(result?.cidr).toBe("2a0d:c2c0:8:ff00::/128");
  });

  test("/128 allocation finds the next host past a larger allocated child", async () => {
    const parentId = await seedParent({
      cidr: "2a0d:c2c0:8:ff00::/56",
      gateway: "2a0d:c2c0:8::1",
    });
    // A /64 child occupies the entire 2a0d:c2c0:8:ff00::/64.
    await seedChild(parentId, "2a0d:c2c0:8:ff00::/64", "2a0d:c2c0:8:ff00::1");

    const result = await findFirstAvailableSubnet(6, 128, PROXMOX_NODE_ID);

    // First /128 outside the /64 is :ff01::.
    expect(result?.cidr).toBe("2a0d:c2c0:8:ff01::/128");
  });

  test("/64 subnet allocation returns the parent network aligned to /64", async () => {
    await seedParent({
      cidr: "2a0d:c2c0:8:ff00::/56",
      gateway: "2a0d:c2c0:8::1",
    });

    const result = await findFirstAvailableSubnet(6, 64, PROXMOX_NODE_ID);

    // Non-max target prefix for IPv6 → no gateway exclusion.
    expect(result?.cidr).toBe("2a0d:c2c0:8:ff00::/64");
  });

  test("/64 subnet allocation advances past an existing /64 child", async () => {
    const parentId = await seedParent({
      cidr: "2a0d:c2c0:8:ff00::/56",
      gateway: "2a0d:c2c0:8::1",
    });
    await seedChild(parentId, "2a0d:c2c0:8:ff00::/64", "2a0d:c2c0:8:ff00::1");

    const result = await findFirstAvailableSubnet(6, 64, PROXMOX_NODE_ID);

    expect(result?.cidr).toBe("2a0d:c2c0:8:ff01::/64");
  });
});

describe("findFirstAvailableSubnet - no parent", () => {
  test("returns null when no parent subnet is linked to the node", async () => {
    const result = await findFirstAvailableSubnet(4, 32, PROXMOX_NODE_ID);

    expect(result).toBeNull();
  });
});
