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

const cacheStore = new Map<string, unknown>();

mock.module("../../../upstash/redis", () => ({
  redis: {
    get: async (key: string) => cacheStore.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      cacheStore.set(key, JSON.parse(JSON.stringify(value)));
    },
    del: async (key: string) => cacheStore.delete(key),
  },
}));

let testDb: TestDb;
let caller: ReturnType<typeof appRouter.createCaller>;

interface HostRuleRaw {
  pos: number;
  enable: number;
  type: string;
  action: string;
  proto?: string;
  dport?: string;
  source?: string;
}

const SS_REDIS =
  'tcp   LISTEN 0 511    0.0.0.0:6379   0.0.0.0:*  users:(("redis-server",pid=8,fd=6))\n';
const SS_WEB = [
  'tcp   LISTEN 0 4096   0.0.0.0:22     0.0.0.0:*  users:(("sshd",pid=1,fd=3))',
  'tcp   LISTEN 0 511    0.0.0.0:443    0.0.0.0:*  users:(("nginx",pid=2,fd=7))',
  "",
].join("\n");

function createProxmoxMock({
  rules = [],
  policyIn = "ACCEPT",
  scripts = {},
  current = { status: "running", qmpstatus: "running", agent: true },
  osinfo = { result: { id: "debian" } },
}: {
  rules?: HostRuleRaw[];
  policyIn?: string;
  scripts?: Record<string, string>;
  current?: Record<string, unknown>;
  osinfo?: unknown;
} = {}) {
  const pending = new Map<number, string>();
  let nextPid = 1;

  const vm = {
    status: { current: { $get: async () => current } },
    firewall: {
      rules: { $get: async () => rules },
      options: { $get: async () => ({ enable: 1, policy_in: policyIn }) },
    },
    agent: {
      "get-osinfo": { $get: async () => osinfo },
      exec: {
        $post: async ({ command }: { command: string[] }) => {
          const script = command[2] ?? "";
          const match = Object.entries(scripts).find(([needle]) =>
            script.includes(needle),
          );
          const pid = nextPid++;
          pending.set(pid, match?.[1] ?? "");
          return { pid };
        },
      },
      "exec-status": {
        $get: async ({ pid }: { pid: number }) => ({
          exited: 1,
          exitcode: 0,
          "out-data": pending.get(pid) ?? "",
        }),
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

const get = () =>
  caller.servers.firewall.analysis.get({ server_id: mockServer.id });

describe("servers.firewall.analysis.get", () => {
  test("a plain web server produces no findings", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        scripts: { "command -v ss": SS_WEB, "command -v ufw": "" },
      }),
    );

    const { analysis } = await get();

    expect(analysis.findings).toEqual([]);
    expect(analysis.checked_at).toBeInstanceOf(Date);
  });

  test("it reports an exposed database with the process holding it", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        scripts: { "command -v ss": SS_REDIS, "command -v ufw": "" },
      }),
    );

    const { analysis } = await get();

    expect(analysis.findings).toHaveLength(1);
    expect(analysis.findings[0]).toMatchObject({
      code: "EXPOSED_SENSITIVE_PORT",
      severity: "critical",
      port: 6379,
      proto: "tcp",
      service: "Redis",
      processes: ["redis-server"],
      suggested_rule: {
        direction: "in",
        action: "DROP",
        proto: "tcp",
        dport: "6379",
      },
    });
  });

  test("a Proxmox rule already blocking the port silences the finding", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        rules: [
          {
            pos: 0,
            enable: 1,
            type: "in",
            action: "DROP",
            proto: "tcp",
            dport: "6379",
          },
        ],
        scripts: { "command -v ss": SS_REDIS, "command -v ufw": "" },
      }),
    );

    expect((await get()).analysis.findings).toEqual([]);
  });

  test("a rule restricted to one network does not count as open to the internet", async () => {
    // Without reading `source`, this would be a false critical on a safe server.
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        policyIn: "DROP",
        rules: [
          {
            pos: 0,
            enable: 1,
            type: "in",
            action: "ACCEPT",
            proto: "tcp",
            dport: "6379",
            source: "10.0.0.0/8",
          },
        ],
        scripts: { "command -v ss": SS_REDIS, "command -v ufw": "" },
      }),
    );

    expect((await get()).analysis.findings).toEqual([]);
  });

  test("ufw blocking the port silences the finding", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        scripts: {
          "command -v ss": SS_REDIS,
          "command -v ufw": "ufw present\nufw active\n",
          "ufw status verbose": [
            "Status: active",
            "Default: deny (incoming), allow (outgoing), disabled (routed)",
            "",
            "To                         Action      From",
            "22/tcp                     ALLOW IN    Anywhere",
          ].join("\n"),
        },
      }),
    );

    expect((await get()).analysis.findings).toEqual([]);
  });

  test("it explains a Virtbase rule that ufw overrules", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        policyIn: "DROP",
        rules: [
          {
            pos: 4,
            enable: 1,
            type: "in",
            action: "ACCEPT",
            proto: "tcp",
            dport: "8443",
          },
        ],
        scripts: {
          "command -v ss": "",
          "command -v ufw": "ufw present\nufw active\n",
          "ufw status verbose": [
            "Status: active",
            "Default: deny (incoming), allow (outgoing), disabled (routed)",
            "",
            "8443/tcp                   DENY IN     Anywhere",
          ].join("\n"),
        },
      }),
    );

    const { analysis } = await get();

    expect(analysis.findings).toHaveLength(1);
    expect(analysis.findings[0]).toMatchObject({
      code: "BLOCKED_BY_GUEST_FIREWALL",
      severity: "warning",
      port: 8443,
      host_rule_pos: 4,
      manager: "ufw",
    });
  });

  test("it declines to advise when the server cannot be inspected", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        current: { status: "stopped", qmpstatus: "stopped", agent: true },
      }),
    );

    const { analysis } = await get();

    expect(analysis.findings).toHaveLength(1);
    expect(analysis.findings[0]?.code).toBe("ANALYSIS_INCOMPLETE");
  });

  test("it reflects a rule change without waiting for the cache to expire", async () => {
    // The guest inspection is cached; the Proxmox reads are not, so advice
    // follows a rule the customer just added straight away.
    let rules: HostRuleRaw[] = [];

    mock.module("../../../proxmox", () => {
      const build = () =>
        createProxmoxMock({
          scripts: { "command -v ss": SS_REDIS, "command -v ufw": "" },
        });

      return {
        getProxmoxInstance: (node: { hostname: string }) => {
          const instance = build().getProxmoxInstance(node);
          instance.node.qemu.$().firewall.rules.$get = async () => rules;
          return instance;
        },
      };
    });

    expect((await get()).analysis.findings).toHaveLength(1);

    rules = [
      {
        pos: 0,
        enable: 1,
        type: "in",
        action: "DROP",
        proto: "tcp",
        dport: "6379",
      },
    ];

    expect((await get()).analysis.findings).toEqual([]);
  });
});
