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

mock.module("react", () => ({
  cache: (fn: (...args: never) => unknown) => fn,
}));
mock.module("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
mock.module("@sentry/nextjs", () => ({ captureException: () => {} }));
mock.module("../../verify-session", () => ({
  verifySession: async () => {},
}));

import {
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
  serverPlans,
  servers,
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
  mockUser,
} from "./fixtures";

let testDb: TestDb;
let getSalesByPlan: typeof import("../get-sales-by-plan").getSalesByPlan;

beforeAll(async () => {
  testDb = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db: testDb }));

  const mod = await import("../get-sales-by-plan");
  getSalesByPlan = mod.getSalesByPlan;

  await testDb.insert(proxmoxNodeGroups).values(mockProxmoxNodeGroup);
  await testDb.insert(datacenters).values(mockDatacenter);
  await testDb.insert(proxmoxNodes).values(mockProxmoxNode);
  await testDb.insert(serverPlans).values([
    mockServerPlan,
    {
      ...mockServerPlan,
      id: "pck_0000000000000000000000002",
      name: "Pro",
      price: 1500,
    },
  ]);
  await testDb.insert(users).values(mockUser);
});

afterAll(async () => {
  await testDb.$client.close();
});

afterEach(async () => {
  await testDb.delete(servers);
});

describe("getSalesByPlan", () => {
  test("it returns an empty array when no servers exist", async () => {
    const result = await getSalesByPlan();

    expect(result).toEqual([]);
  });

  test("it returns sales grouped by plan name", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await testDb.insert(servers).values([
      { ...mockServer, createdAt: yesterday },
      {
        ...mockServer,
        id: "kvm_0000000000000000000000002",
        vmid: 101,
        createdAt: yesterday,
      },
      {
        ...mockServer,
        id: "kvm_0000000000000000000000003",
        vmid: 102,
        serverPlanId: "pck_0000000000000000000000002",
        createdAt: yesterday,
      },
    ]);

    const result = await getSalesByPlan();

    const sorted = [...result].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted).toHaveLength(2);
    expect(sorted[0]?.name).toBe("Pro");
    expect(sorted[0]?.count).toBe(1);
    expect(sorted[1]?.name).toBe("Starter");
    expect(sorted[1]?.count).toBe(2);
  });

  test("it excludes servers created more than a month ago", async () => {
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 2);

    await testDb.insert(servers).values({
      ...mockServer,
      createdAt: oldDate,
      updatedAt: oldDate,
    });

    const result = await getSalesByPlan();

    expect(result).toEqual([]);
  });
});
