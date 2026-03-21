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

import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

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
  proxmoxTemplateGroups,
  proxmoxTemplates,
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
  mockProxmoxTemplate,
  mockProxmoxTemplateGroup,
  mockServer,
  mockServerPlan,
  mockUser,
} from "./fixtures";

let testDb: TestDb;
let getLatestServers: typeof import("../get-latest-servers").getLatestServers;

beforeAll(async () => {
  testDb = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db: testDb }));

  const mod = await import("../get-latest-servers");
  getLatestServers = mod.getLatestServers;

  await testDb.insert(proxmoxNodeGroups).values(mockProxmoxNodeGroup);
  await testDb.insert(datacenters).values(mockDatacenter);
  await testDb.insert(proxmoxNodes).values(mockProxmoxNode);
  await testDb.insert(serverPlans).values(mockServerPlan);
  await testDb.insert(proxmoxTemplateGroups).values(mockProxmoxTemplateGroup);
  await testDb.insert(proxmoxTemplates).values(mockProxmoxTemplate);
  await testDb.insert(users).values(mockUser);
});

afterEach(async () => {
  await testDb.delete(servers);
});

describe("getLatestServers", () => {
  test("it returns an empty array when no servers exist", async () => {
    const result = await getLatestServers();

    expect(result).toEqual([]);
  });

  test("it returns the latest servers with plan name and template icon", async () => {
    await testDb.insert(servers).values({
      ...mockServer,
      proxmoxTemplateId: mockProxmoxTemplate.id,
    });

    const result = await getLatestServers();

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe(mockServer.name);
    expect(result[0]?.plan).toBe(mockServerPlan.name);
    expect(result[0]?.icon).toBe(mockProxmoxTemplate.icon);
  });

  test("it returns null icon when server has no template", async () => {
    await testDb.insert(servers).values(mockServer);

    const result = await getLatestServers();

    expect(result).toHaveLength(1);
    expect(result[0]?.icon).toBeNull();
  });

  test("it limits results to 5 and orders by id descending", async () => {
    const serverValues = Array.from({ length: 7 }, (_, i) => ({
      ...mockServer,
      id: `kvm_000000000000000000000000${i + 1}`,
      vmid: 100 + i,
      name: `Server ${i + 1}`,
    }));

    await testDb.insert(servers).values(serverValues);

    const result = await getLatestServers();

    expect(result).toHaveLength(5);
    expect(result[0]?.name).toBe("Server 7");
    expect(result[4]?.name).toBe("Server 3");
  });
});
