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

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
  serverPlanPrices,
  serverPlans,
  servers,
  subnetAllocations,
  subnets,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import {
  mockDatacenter,
  mockProxmoxNode,
  mockProxmoxNodeGroup,
  mockServer,
  mockServerPlan,
  mockServerPlanPrice,
  mockSession,
} from "../../testing";
import { resolveSignalSubject } from "../resolve-subject";

let testDb: TestDb;

const OTHER_USER = "usr_0000000000000000000000009";
const SERVER_A = mockServer.id;
const SERVER_B = "kvm_0000000000000000000000002";

const HOUR = 3_600_000;
const now = () => new Date();
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR);

const resolve = (value: string, occurredAt: Date) =>
  resolveSignalSubject({
    db: testDb as never,
    subject: { kind: "ip", value },
    occurredAt,
  });

beforeEach(async () => {
  testDb = await createTestDb();

  await testDb.insert(users).values(mockSession.user);
  await testDb
    .insert(users)
    .values({ ...mockSession.user, id: OTHER_USER, email: "other@test.dev" });
  await testDb.insert(datacenters).values(mockDatacenter);
  await testDb.insert(proxmoxNodeGroups).values(mockProxmoxNodeGroup);
  await testDb.insert(serverPlans).values(mockServerPlan);
  await testDb.insert(serverPlanPrices).values(mockServerPlanPrice);
  await testDb.insert(proxmoxNodes).values(mockProxmoxNode);
  await testDb.insert(servers).values(mockServer);
  await testDb.insert(servers).values({
    ...mockServer,
    id: SERVER_B,
    vmid: mockServer.vmid + 1,
    userId: OTHER_USER,
  });
});

afterEach(async () => {
  await testDb.$client.close();
});

describe("resolveSignalSubject", () => {
  test("attributes an address to the server holding it", async () => {
    await testDb.insert(subnets).values({
      id: "ipsub_a",
      cidr: "203.0.113.8/32",
      gateway: "203.0.113.1",
    });
    await testDb.insert(subnetAllocations).values({
      subnetId: "ipsub_a",
      serverId: SERVER_A,
      allocatedAt: hoursAgo(48),
    });

    expect(await resolve("203.0.113.8", now())).toMatchObject({
      attribution: "attributed",
      serverId: SERVER_A,
      userId: mockSession.user.id,
    });
  });

  test("resolves an address inside a larger allocated block", async () => {
    await testDb.insert(subnets).values({
      id: "ipsub_block",
      cidr: "203.0.113.0/24",
      gateway: "203.0.113.1",
    });
    await testDb.insert(subnetAllocations).values({
      subnetId: "ipsub_block",
      serverId: SERVER_A,
      allocatedAt: hoursAgo(48),
    });

    expect(await resolve("203.0.113.55", now())).toMatchObject({
      attribution: "attributed",
      serverId: SERVER_A,
    });
  });

  test("the most specific subnet wins when blocks nest", async () => {
    await testDb.insert(subnets).values([
      { id: "ipsub_wide", cidr: "203.0.113.0/24", gateway: "203.0.113.1" },
      { id: "ipsub_host", cidr: "203.0.113.9/32", gateway: "203.0.113.1" },
    ]);
    await testDb.insert(subnetAllocations).values([
      { subnetId: "ipsub_wide", serverId: SERVER_B, allocatedAt: hoursAgo(48) },
      { subnetId: "ipsub_host", serverId: SERVER_A, allocatedAt: hoursAgo(48) },
    ]);

    // Both cover the address; the /32 is the one that means something.
    expect(await resolve("203.0.113.9", now())).toMatchObject({
      attribution: "attributed",
      serverId: SERVER_A,
    });
  });

  test("attributes a late report to whoever held the address then", async () => {
    // The failure this whole mechanism exists to prevent: a report arrives two
    // days late, the address has since moved, and the wrong customer is the
    // one holding it today.
    await testDb.insert(subnets).values({
      id: "ipsub_r",
      cidr: "203.0.113.10/32",
      gateway: "203.0.113.1",
    });

    await testDb.insert(subnetAllocations).values({
      subnetId: "ipsub_r",
      serverId: SERVER_A,
      allocatedAt: hoursAgo(96),
      deallocatedAt: hoursAgo(24),
    });
    await testDb.insert(subnetAllocations).values({
      subnetId: "ipsub_r",
      serverId: SERVER_B,
      allocatedAt: hoursAgo(24),
    });

    const result = await resolve("203.0.113.10", hoursAgo(48));

    expect(result.attribution).toBe("stale");
    expect(result.serverId).toBe(SERVER_A);
    expect(result.userId).toBe(mockSession.user.id);
    // Both parties are named, so an operator can see the handover.
    expect(result.currentServerId).toBe(SERVER_B);
  });

  test("a report about the current holder is not stale", async () => {
    await testDb.insert(subnets).values({
      id: "ipsub_c",
      cidr: "203.0.113.11/32",
      gateway: "203.0.113.1",
    });
    await testDb.insert(subnetAllocations).values({
      subnetId: "ipsub_c",
      serverId: SERVER_A,
      allocatedAt: hoursAgo(96),
    });

    expect(await resolve("203.0.113.11", hoursAgo(2))).toMatchObject({
      attribution: "attributed",
      currentServerId: null,
    });
  });

  test("an address released since is stale, not unattributed", async () => {
    await testDb.insert(subnets).values({
      id: "ipsub_d",
      cidr: "203.0.113.12/32",
      gateway: "203.0.113.1",
    });
    await testDb.insert(subnetAllocations).values({
      subnetId: "ipsub_d",
      serverId: SERVER_A,
      allocatedAt: hoursAgo(96),
      deallocatedAt: hoursAgo(1),
    });

    const result = await resolve("203.0.113.12", hoursAgo(48));

    expect(result.attribution).toBe("stale");
    expect(result.serverId).toBe(SERVER_A);
    expect(result.currentServerId).toBeNull();
  });

  test("nobody held it then, even if somebody holds it now", async () => {
    await testDb.insert(subnets).values({
      id: "ipsub_e",
      cidr: "203.0.113.13/32",
      gateway: "203.0.113.1",
    });
    await testDb.insert(subnetAllocations).values({
      subnetId: "ipsub_e",
      serverId: SERVER_A,
      allocatedAt: hoursAgo(2),
    });

    // The report is about a moment this customer was not in.
    expect(await resolve("203.0.113.13", hoursAgo(48))).toMatchObject({
      attribution: "unattributed",
      serverId: null,
      userId: null,
    });
  });

  test("two allocations covering one moment are ambiguous, not a guess", async () => {
    // `subnets.cidr` is unique, so the way this really happens is one subnet
    // allocated to a second server before the first was released. A partial
    // unique index stops both rows being live *now*, but it cannot stop their
    // windows overlapping in the past - and a report is always about the past.
    await testDb.insert(subnets).values({
      id: "ipsub_f",
      cidr: "203.0.113.14/32",
      gateway: "203.0.113.1",
    });
    await testDb.insert(subnetAllocations).values([
      {
        subnetId: "ipsub_f",
        serverId: SERVER_A,
        allocatedAt: hoursAgo(48),
        deallocatedAt: hoursAgo(1),
      },
      { subnetId: "ipsub_f", serverId: SERVER_B, allocatedAt: hoursAgo(48) },
    ]);

    // An IPAM error, not an abuse question. Picking one would suspend a coin
    // flip.
    expect(await resolve("203.0.113.14", hoursAgo(24))).toMatchObject({
      attribution: "ambiguous",
      serverId: null,
      userId: null,
    });
  });

  test("an unallocated address resolves to nobody", async () => {
    expect(await resolve("198.51.100.7", now())).toMatchObject({
      attribution: "unattributed",
    });
  });

  test("resolves a server, a user and an order directly", async () => {
    expect(
      await resolveSignalSubject({
        db: testDb as never,
        subject: { kind: "server", value: SERVER_A },
        occurredAt: now(),
      }),
    ).toMatchObject({ serverId: SERVER_A, userId: mockSession.user.id });

    expect(
      await resolveSignalSubject({
        db: testDb as never,
        subject: { kind: "user", value: OTHER_USER },
        occurredAt: now(),
      }),
    ).toMatchObject({ serverId: null, userId: OTHER_USER });
  });

  test("resolves a guest by its node and vmid", async () => {
    // The shape an alerting stack can actually produce: Prometheus knows the
    // node and the vmid off a tap interface and nothing about server ids.
    expect(
      await resolveSignalSubject({
        db: testDb as never,
        subject: {
          kind: "vm",
          value: String(mockServer.vmid),
          node: mockProxmoxNode.hostname,
        },
        occurredAt: now(),
      }),
    ).toMatchObject({
      attribution: "attributed",
      serverId: SERVER_A,
      userId: mockSession.user.id,
    });
  });

  test("the same vmid on another node is a different machine", async () => {
    expect(
      await resolveSignalSubject({
        db: testDb as never,
        subject: {
          kind: "vm",
          value: String(mockServer.vmid),
          node: "pve-somewhere-else",
        },
        occurredAt: now(),
      }),
    ).toMatchObject({ attribution: "unattributed", serverId: null });
  });

  test("a node is ours, so there is nobody to attribute it to", async () => {
    expect(
      await resolveSignalSubject({
        db: testDb as never,
        subject: { kind: "node", value: mockProxmoxNode.hostname },
        occurredAt: now(),
      }),
    ).toMatchObject({ attribution: "unattributed", userId: null });
  });
});
