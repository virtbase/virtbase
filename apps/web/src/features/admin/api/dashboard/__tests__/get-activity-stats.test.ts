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
  invoices,
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
  mockInvoice,
  mockProxmoxNode,
  mockProxmoxNodeGroup,
  mockServer,
  mockServerPlan,
  mockUser,
} from "./fixtures";

let testDb: TestDb;
let getActivityStats: typeof import("../get-activity-stats").getActivityStats;

beforeAll(async () => {
  testDb = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db: testDb }));

  const mod = await import("../get-activity-stats");
  getActivityStats = mod.getActivityStats;

  await testDb.insert(proxmoxNodeGroups).values(mockProxmoxNodeGroup);
  await testDb.insert(datacenters).values(mockDatacenter);
  await testDb.insert(proxmoxNodes).values(mockProxmoxNode);
  await testDb.insert(serverPlans).values(mockServerPlan);
});

afterAll(async () => {
  await testDb.$client.close();
});

afterEach(async () => {
  await testDb.delete(invoices);
  await testDb.delete(servers);
  await testDb.delete(users);
});

describe("getActivityStats", () => {
  test("it returns zero counts when the database is empty", async () => {
    const result = await getActivityStats();

    expect(result.customersCount).toBe(0);
    expect(result.activeServersCount).toBe(0);
    expect(result.monthlyRevenue).toBe(0);
  });

  test("it counts active (non-banned) customers", async () => {
    await testDb.insert(users).values([
      mockUser,
      {
        ...mockUser,
        id: "usr_0000000000000000000000002",
        email: "customer2@example.com",
        banned: false,
      },
      {
        ...mockUser,
        id: "usr_0000000000000000000000003",
        email: "banned@example.com",
        banned: true,
      },
    ]);

    const result = await getActivityStats();

    expect(result.customersCount).toBe(2);
  });

  test("it counts servers with future or null terminatesAt as active", async () => {
    await testDb.insert(users).values(mockUser);
    await testDb.insert(servers).values([
      mockServer,
      {
        ...mockServer,
        id: "kvm_0000000000000000000000002",
        vmid: 101,
        terminatesAt: null,
      },
      {
        ...mockServer,
        id: "kvm_0000000000000000000000003",
        vmid: 102,
        terminatesAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    ]);

    const result = await getActivityStats();

    expect(result.activeServersCount).toBe(2);
  });

  test("it calculates monthly revenue from paid invoices", async () => {
    await testDb.insert(users).values(mockUser);
    await testDb.insert(invoices).values([
      {
        ...mockInvoice,
        paidAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
      {
        ...mockInvoice,
        lexwareInvoiceId: "00000000-0000-0000-0000-000000000002",
        number: "RE-2026-0002",
        total: 2000,
        paidAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
      {
        ...mockInvoice,
        lexwareInvoiceId: "00000000-0000-0000-0000-000000000003",
        number: "RE-2026-0003",
        total: 500,
        paidAt: null,
      },
    ]);

    const result = await getActivityStats();

    // 1000 + 2000 = 3000 cents => 30 euros (unpaid invoice excluded)
    expect(result.monthlyRevenue).toBe(30);
  });
});
