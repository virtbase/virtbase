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
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import {
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
  serverPlanPrices,
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
  mockServerPlanPrice,
  mockSession,
} from "../fixtures";

// Redis is stubbed rather than exercised: `cached` degrades on any Redis error,
// so a real client would still pass while quietly making the suite depend on
// the network. The store is cleared per test to keep them independent.
const cacheStore = new Map<string, unknown>();

mock.module("../../../upstash/redis", () => ({
  redis: {
    get: async (key: string) => cacheStore.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      // Round-trip through JSON the way Redis would, so a Date leaking into the
      // cached payload fails here rather than in production.
      cacheStore.set(key, JSON.parse(JSON.stringify(value)));
    },
    del: async (key: string) => cacheStore.delete(key),
  },
}));

let testDb: TestDb;
let caller: ReturnType<typeof appRouter.createCaller>;

interface StatusResponse {
  status?: string;
  qmpstatus?: string;
  lock?: string;
  agent?: boolean | number;
}

/**
 * A Proxmox client reduced to the calls the agent router makes.
 */
function createProxmoxMock({
  current,
  info,
  osinfo,
  infoError,
}: {
  current: StatusResponse;
  info?: unknown;
  osinfo?: unknown;
  infoError?: unknown;
}) {
  const vm = {
    status: { current: { $get: async () => current } },
    agent: {
      info: {
        $get: async () => {
          if (infoError) throw infoError;
          return info;
        },
      },
      "get-osinfo": {
        $get: async () => {
          if (infoError) throw infoError;
          return osinfo;
        },
      },
    },
  };

  return {
    getProxmoxInstance: (proxmoxNode: { hostname: string }) => ({
      proxmox: {},
      engine: {},
      node: { qemu: { $: () => vm } },
      hostname: proxmoxNode.hostname,
      cluster: {},
    }),
  };
}

const supportedCommands = (execEnabled: boolean) => [
  { name: "guest-ping", enabled: true },
  { name: "guest-exec", enabled: execEnabled },
];

beforeAll(async () => {
  testDb = await createTestDb();

  await testDb.insert(users).values(mockSession.user).onConflictDoNothing();
  await testDb.insert(datacenters).values(mockDatacenter).onConflictDoNothing();
  await testDb
    .insert(proxmoxNodeGroups)
    .values(mockProxmoxNodeGroup)
    .onConflictDoNothing();
  await testDb.insert(serverPlans).values(mockServerPlan).onConflictDoNothing();
  await testDb
    .insert(serverPlanPrices)
    .values(mockServerPlanPrice)
    .onConflictDoNothing();
  await testDb
    .insert(proxmoxNodes)
    .values(mockProxmoxNode)
    .onConflictDoNothing();
  await testDb.insert(servers).values(mockServer).onConflictDoNothing();

  caller = appRouter.createCaller({
    db: testDb as never,
    authApi: {} as never,
    apiKey: null,
    headers: new Headers(),
    setHeader: () => {},
    session: mockSession,
  });
});

beforeEach(() => {
  cacheStore.clear();
});

afterAll(async () => {
  await testDb.$client.close();
});

const running = { status: "running", qmpstatus: "running", agent: true };

describe("servers.agent.get", () => {
  test("it reports a healthy agent with its OS", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        current: running,
        info: {
          result: {
            version: "8.2.1",
            supported_commands: supportedCommands(true),
          },
        },
        osinfo: {
          result: {
            id: "debian",
            "pretty-name": "Debian GNU/Linux 12 (bookworm)",
          },
        },
      }),
    );

    const result = await caller.servers.agent.get({
      server_id: mockServer.id,
    });

    expect(result.agent).toMatchObject({
      status: "ok",
      configured: true,
      reachable: true,
      exec_available: true,
      version: "8.2.1",
      os: { id: "debian", pretty_name: "Debian GNU/Linux 12 (bookworm)" },
    });
    expect(result.agent.checked_at).toBeInstanceOf(Date);
  });

  test("it does not probe a stopped server", async () => {
    let probed = false;

    mock.module("../../../proxmox", () => {
      const proxmoxMock = createProxmoxMock({
        current: { status: "stopped", qmpstatus: "stopped", agent: true },
      });

      return {
        getProxmoxInstance: (node: { hostname: string }) => {
          const instance = proxmoxMock.getProxmoxInstance(node);
          const vm = instance.node.qemu.$();
          vm.agent.info.$get = async () => {
            probed = true;
            return {};
          };
          return instance;
        },
      };
    });

    const result = await caller.servers.agent.get({
      server_id: mockServer.id,
    });

    expect(result.agent.status).toBe("server_stopped");
    expect(result.agent.reachable).toBe(false);
    // Probing a switched-off VM only ever produces a confusing error.
    expect(probed).toBe(false);
  });

  test("it reports an agent that is not enabled in the configuration", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({ current: { ...running, agent: false } }),
    );

    const result = await caller.servers.agent.get({
      server_id: mockServer.id,
    });

    expect(result.agent).toMatchObject({
      status: "not_configured",
      configured: false,
    });
  });

  test("it reports a removed agent as unreachable", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        current: running,
        infoError: new Error(
          'GET https://n/api2/json/x return Error 500 Internal Server Error: {"errors":"QEMU guest agent is not running"}',
        ),
      }),
    );

    const result = await caller.servers.agent.get({
      server_id: mockServer.id,
    });

    expect(result.agent).toMatchObject({
      status: "unreachable",
      configured: true,
      reachable: false,
      os: null,
    });
  });

  test("it reports a blocked guest-exec distinctly from a missing agent", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        current: running,
        info: { result: { supported_commands: supportedCommands(false) } },
        osinfo: { result: { id: "ubuntu" } },
      }),
    );

    const result = await caller.servers.agent.get({
      server_id: mockServer.id,
    });

    expect(result.agent).toMatchObject({
      status: "exec_unavailable",
      reachable: true,
      exec_available: false,
    });
  });

  test("it serves a cached result and re-probes only when refresh is set", async () => {
    let probes = 0;

    mock.module("../../../proxmox", () => {
      const build = () =>
        createProxmoxMock({
          current: running,
          info: {
            result: {
              version: "8.2.1",
              supported_commands: supportedCommands(true),
            },
          },
          osinfo: { result: { id: "debian" } },
        });

      return {
        getProxmoxInstance: (node: { hostname: string }) => {
          const instance = build().getProxmoxInstance(node);
          const vm = instance.node.qemu.$();
          const original = vm.agent.info.$get;
          vm.agent.info.$get = async () => {
            probes++;
            return original();
          };
          return instance;
        },
      };
    });

    await caller.servers.agent.get({ server_id: mockServer.id });
    await caller.servers.agent.get({ server_id: mockServer.id });

    expect(probes).toBe(1);

    await caller.servers.agent.get({
      server_id: mockServer.id,
      refresh: true,
    });

    expect(probes).toBe(2);
  });

  test("it returns a Date on a cache hit, not the string Redis stored", async () => {
    // The cached payload is plain JSON, so a Date stored in it would come back
    // as a string and fail the output schema on every hit but the first.
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        current: running,
        info: { result: { supported_commands: supportedCommands(true) } },
        osinfo: { result: { id: "debian" } },
      }),
    );

    await caller.servers.agent.get({ server_id: mockServer.id });
    const cachedResult = await caller.servers.agent.get({
      server_id: mockServer.id,
    });

    expect(cachedResult.agent.checked_at).toBeInstanceOf(Date);
    expect(Number.isNaN(cachedResult.agent.checked_at.getTime())).toBe(false);
  });
});
