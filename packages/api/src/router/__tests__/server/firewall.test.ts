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

import { beforeAll, describe, expect, mock, test } from "bun:test";
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
let _unauthenticatedCaller: ReturnType<typeof appRouter.createCaller>;

beforeAll(async () => {
  testDb = await createTestDb();

  // Create a test user, required for linking ssh keys
  await testDb.insert(users).values(mockSession.user).onConflictDoNothing();

  // Create the necessary database entities
  await testDb.insert(datacenters).values(mockDatacenter).onConflictDoNothing();
  await testDb
    .insert(proxmoxNodeGroups)
    .values(mockProxmoxNodeGroup)
    .onConflictDoNothing();
  await testDb.insert(serverPlans).values(mockServerPlan).onConflictDoNothing();
  await testDb
    .insert(proxmoxNodes)
    .values(mockProxmoxNode)
    .onConflictDoNothing();
  await testDb.insert(servers).values(mockServer).onConflictDoNothing();

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

  _unauthenticatedCaller = appRouter.createCaller({
    ...sharedContext,
    session: null,
  });
});

function createProxmoxMock(vm: {
  $get?: () => Promise<{
    enable: number;
    policy_in?: string;
    policy_out?: string;
    digest?: string;
  }>;
  $put?: (params: { policy_in?: string; policy_out?: string }) => Promise<void>;
}) {
  const options = {
    $get:
      vm.$get ??
      (() =>
        Promise.resolve({
          enable: 0,
          policy_in: undefined,
          policy_out: undefined,
          digest: undefined,
        })),
    $put: vm.$put ?? (() => Promise.resolve()),
  };
  return {
    getProxmoxInstance: (proxmoxNode: { hostname: string }) => ({
      proxmox: {},
      engine: {},
      node: { qemu: { $: () => ({ firewall: { options } }) } },
      hostname: proxmoxNode.hostname,
      cluster: {},
    }),
  };
}

describe("server.firewall.options.get", () => {
  test("it gets the firewall settings if the user is authenticated and the server exists", async () => {
    const mockFirewallOptions = {
      enable: 0,
      policy_in: "ACCEPT",
      policy_out: "REJECT",
      digest: undefined,
    };

    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        $get: () => Promise.resolve(mockFirewallOptions),
      }),
    );

    const result = await caller.server.firewall.options.get({
      server_id: mockServer.id,
    });

    expect(result).toEqual({
      options: {
        enabled: false,
        policy_in: "ACCEPT",
        policy_out: "REJECT",
        digest: undefined,
      },
    });
  });
});

describe("server.firewall.options.update", () => {
  test("it updates the firewall settings if the user is authenticated and the server exists", async () => {
    const $put = mock(() => Promise.resolve());

    mock.module("../../../proxmox", () => createProxmoxMock({ $put }));

    const result = await caller.server.firewall.options.update({
      server_id: mockServer.id,
      policy_in: "DROP",
      policy_out: "ACCEPT",
    });

    expect(result).toBeUndefined();
    expect($put).toHaveBeenCalledTimes(1);
    expect($put).toHaveBeenCalledWith({
      policy_in: "DROP",
      policy_out: "ACCEPT",
    });
  });
});
