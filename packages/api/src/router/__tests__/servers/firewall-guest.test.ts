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
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { appRouter } from "../../../root";
import { mockServer, mockSession, seedServerGraph } from "../../../testing";

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

const UFW_STATUS = [
  "Status: active",
  "Default: deny (incoming), allow (outgoing), disabled (routed)",
  "",
  "To                         Action      From",
  "--                         ------      ----",
  "22/tcp                     ALLOW IN    Anywhere",
  "80,443/tcp                 ALLOW IN    Anywhere",
].join("\n");

/**
 * A Proxmox client whose guest-exec answers per script.
 *
 * `scripts` is matched by substring against the shell script argument, so a
 * test declares only the commands it cares about.
 */
function createProxmoxMock({
  current = { status: "running", qmpstatus: "running", agent: true },
  osinfo = { result: { id: "debian" } },
  scripts = {},
  execError,
  onScript,
}: {
  current?: Record<string, unknown>;
  osinfo?: unknown;
  scripts?: Record<string, string>;
  execError?: unknown;
  onScript?: (script: string) => void;
} = {}) {
  const pending = new Map<number, string>();
  let nextPid = 1;

  const vm = {
    status: { current: { $get: async () => current } },
    agent: {
      "get-osinfo": { $get: async () => osinfo },
      exec: {
        $post: async ({ command }: { command: string[] }) => {
          if (execError) throw execError;

          const script = command[2] ?? "";
          onScript?.(script);

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

  await seedServerGraph(testDb);

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
  caller.servers.firewall.guest.get({ server_id: mockServer.id });

describe("servers.firewall.guest.get", () => {
  test("it reads an active ufw and its rules", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        scripts: {
          "command -v ufw": "ufw present\nufw active\niptables present\n",
          "ufw status verbose": UFW_STATUS,
        },
      }),
    );

    const { guest } = await get();

    expect(guest.status).toBe("ok");
    expect(guest.primary).toBe("ufw");
    expect(guest.default_policy).toEqual({
      incoming: "DROP",
      outgoing: "ACCEPT",
    });
    expect(guest.rules).toHaveLength(2);
    expect(guest.rules[0]).toMatchObject({
      manager: "ufw",
      direction: "in",
      action: "ACCEPT",
      dport: "22",
      proto: "tcp",
    });
    expect(guest.unreadable_manager).toBeNull();
  });

  test("it reports a server with nothing filtering as no_firewall", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        scripts: { "command -v ufw": "ufw present\niptables present\n" },
      }),
    );

    const { guest } = await get();

    expect(guest.status).toBe("no_firewall");
    expect(guest.primary).toBeNull();
    expect(guest.rules).toEqual([]);
    // Installed but idle is still worth reporting.
    expect(guest.managers).toEqual([
      { manager: "ufw", present: true, active: false },
      { manager: "iptables", present: true, active: false },
    ]);
  });

  test("it does not claim a server is unprotected when it could not look", async () => {
    // The distinction that matters most in this router: `unavailable` must
    // never collapse into `no_firewall`, or a customer reads "nothing is
    // filtering" when in truth nobody checked.
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        execError: new Error(
          'POST https://n/x return Error 500 Internal Server Error: {"errors":"No QEMU guest agent configured"}',
        ),
      }),
    );

    const { guest } = await get();

    expect(guest.status).toBe("unavailable");
    expect(guest.rules).toEqual([]);
    expect(guest.managers).toEqual([]);
  });

  test("it reports a stopped server as unavailable rather than unprotected", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        current: { status: "stopped", qmpstatus: "stopped", agent: true },
      }),
    );

    expect((await get()).guest.status).toBe("unavailable");
  });

  test("it does not run POSIX probes against a Windows guest", async () => {
    let ran = false;

    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        osinfo: { result: { id: "mswindows" } },
        onScript: () => {
          ran = true;
        },
      }),
    );

    expect((await get()).guest.status).toBe("unavailable");
    expect(ran).toBe(false);
  });

  test("it warns about a firewall it cannot read yet", async () => {
    // firewalld has no parser, but its rules still apply to the customer's
    // traffic - saying nothing would be worse than saying "we found this".
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        scripts: {
          "command -v ufw": "firewalld present\nfirewalld active\n",
        },
      }),
    );

    const { guest } = await get();

    expect(guest.status).toBe("ok");
    expect(guest.primary).toBe("firewalld");
    expect(guest.unreadable_manager).toBe("firewalld");
    expect(guest.rules).toEqual([]);
  });

  test("it prefers ufw over the backend it compiles to", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        scripts: {
          "command -v ufw":
            "ufw present\nufw active\nnftables present\nnftables active\niptables present\niptables active\n",
          "ufw status verbose": UFW_STATUS,
        },
      }),
    );

    const { guest } = await get();

    expect(guest.primary).toBe("ufw");
    expect(guest.managers).toHaveLength(3);
  });

  test("it caches the inspection and re-runs it only on refresh", async () => {
    let inspections = 0;

    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        scripts: {
          "command -v ufw": "ufw present\nufw active\n",
          "ufw status verbose": UFW_STATUS,
        },
        onScript: (script) => {
          if (script.includes("command -v ufw")) inspections++;
        },
      }),
    );

    await get();
    await get();

    expect(inspections).toBe(1);

    await caller.servers.firewall.guest.get({
      server_id: mockServer.id,
      refresh: true,
    });

    expect(inspections).toBe(2);
  });

  test("it returns a Date on a cache hit", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        scripts: {
          "command -v ufw": "ufw present\nufw active\n",
          "ufw status verbose": UFW_STATUS,
        },
      }),
    );

    await get();
    const cachedResult = await get();

    expect(cachedResult.guest.checked_at).toBeInstanceOf(Date);
    expect(Number.isNaN(cachedResult.guest.checked_at.getTime())).toBe(false);
  });

  test("it keeps the raw line of every rule", async () => {
    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        scripts: {
          "command -v ufw": "ufw present\nufw active\n",
          "ufw status verbose": UFW_STATUS,
        },
      }),
    );

    const { guest } = await get();

    for (const rule of guest.rules) {
      expect(rule.raw.length).toBeGreaterThan(0);
    }
  });
});
