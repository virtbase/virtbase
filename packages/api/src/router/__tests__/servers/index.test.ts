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

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { eq } from "@virtbase/db";
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
import { appRouter } from "../../../root";
import {
  mockDatacenter,
  mockProxmoxNode,
  mockProxmoxNodeGroup,
  mockServer,
  mockServerPlan,
  mockSession,
} from "../fixtures";

let testDb: TestDb;
let caller: ReturnType<typeof appRouter.createCaller>;
let unauthenticatedCaller: ReturnType<typeof appRouter.createCaller>;

beforeAll(async () => {
  testDb = await createTestDb();

  // Create a test user, required for linking ssh keys
  await testDb.insert(users).values(mockSession.user).onConflictDoNothing();

  const sharedContext = {
    db: testDb as never,
    authApi: {} as never,
    apiKey: null,
    lexware: null,
    headers: new Headers(),
    setHeader: () => {},
  };

  caller = appRouter.createCaller({
    ...sharedContext,
    session: mockSession,
  });

  unauthenticatedCaller = appRouter.createCaller({
    ...sharedContext,
    session: null,
  });
});

afterAll(async () => {
  await testDb.$client.close();
});

describe("server.rename", () => {
  test("it throws an unauthorized error if the user is unauthenticated", async () => {
    const resultPromise = unauthenticatedCaller.servers.rename({
      server_id: mockServer.id,
      name: "My server",
    });

    expect(resultPromise).rejects.toThrow(
      new TRPCError({ code: "UNAUTHORIZED" }),
    );
  });

  test("it throws a bad request error if the server ID is invalid", async () => {
    const resultPromise = caller.servers.rename({
      server_id: "invalid",
      name: "My server",
    });

    expect(resultPromise).rejects.toThrow(
      new TRPCError({ code: "BAD_REQUEST" }),
    );
  });

  test("it throws a not found error if the server does not exist", async () => {
    const resultPromise = caller.servers.rename({
      server_id: mockServer.id,
      name: "My server",
    });

    expect(resultPromise).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));
  });

  test("it renames the server if the user is authenticated and the server exists", async () => {
    await testDb.insert(datacenters).values(mockDatacenter);
    await testDb.insert(proxmoxNodeGroups).values(mockProxmoxNodeGroup);
    await testDb.insert(serverPlans).values(mockServerPlan);
    await testDb.insert(proxmoxNodes).values(mockProxmoxNode);
    await testDb.insert(servers).values(mockServer);

    const result = await caller.servers.rename({
      server_id: mockServer.id,
      name: "My new server name",
    });

    expect(result).toBeUndefined();

    const updated = await testDb
      .select()
      .from(servers)
      .where(eq(servers.id, mockServer.id))
      .then(([row]) => row);

    expect(updated?.name).toBe("My new server name");
  });
});
