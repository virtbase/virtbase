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

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
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

afterAll(async () => {
  await testDb.$client.close();
});

type FirewallRuleRaw = {
  enable: number;
  action: string;
  type: string;
  pos: number;
  proto?: string;
  dport?: string;
  sport?: string;
  comment?: string;
  "icmp-type"?: string;
  digest?: string;
};

type FirewallRulesMock = {
  $get?: () => Promise<FirewallRuleRaw[]>;
  $post?: (params: Record<string, unknown>) => Promise<void>;
  /** Per-rule slot for `rules.$(pos)` — `$put` / `$delete` default to no-ops. */
  $?: (pos: string) => {
    $put?: (params: Record<string, unknown>) => Promise<void>;
    $delete?: (params: { digest?: string }) => Promise<void>;
  };
};

function createProxmoxMock(vm: {
  $get?: () => Promise<{
    enable: number;
    policy_in?: string;
    policy_out?: string;
    digest?: string;
  }>;
  $put?: (params: { policy_in?: string; policy_out?: string }) => Promise<void>;
  rules?: FirewallRulesMock;
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
  const rulesCfg = vm.rules;
  const rules = {
    $get: rulesCfg?.$get ?? (() => Promise.resolve([])),
    $post: rulesCfg?.$post ?? (() => Promise.resolve()),
    $: (pos: string) => {
      const slot = rulesCfg?.$?.(pos);
      return {
        $put: slot?.$put ?? (() => Promise.resolve()),
        $delete: slot?.$delete ?? (() => Promise.resolve()),
      };
    },
  };
  return {
    getProxmoxInstance: (proxmoxNode: { hostname: string }) => ({
      proxmox: {},
      engine: {},
      node: { qemu: { $: () => ({ firewall: { options, rules } }) } },
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

    const result = await caller.servers.firewall.options.get({
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

    const result = await caller.servers.firewall.options.update({
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

describe("server.firewall.rules.get", () => {
  test("it returns mapped firewall rules when the user is authenticated and the server exists", async () => {
    const mockRules: FirewallRuleRaw[] = [
      {
        enable: 1,
        action: "ACCEPT",
        type: "in",
        pos: 0,
        proto: "tcp",
        dport: "443",
        sport: undefined,
        comment: "HTTPS",
        "icmp-type": undefined,
        digest: "dig-0",
      },
    ];

    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        rules: {
          $get: () => Promise.resolve(mockRules),
        },
      }),
    );

    const result = await caller.servers.firewall.rules.get({
      server_id: mockServer.id,
    });

    expect(result).toEqual({
      rules: [
        {
          enabled: true,
          action: "ACCEPT",
          direction: "in",
          pos: 0,
          proto: "tcp",
          dport: "443",
          sport: undefined,
          comment: "HTTPS",
          icmp_type: undefined,
          digest: "dig-0",
        },
      ],
    });
  });
});

describe("server.firewall.rules.create", () => {
  test("it creates a firewall rule with the expected Proxmox payload", async () => {
    const $post = mock(() => Promise.resolve());

    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        rules: { $post },
      }),
    );

    await caller.servers.firewall.rules.create({
      server_id: mockServer.id,
      enabled: true,
      direction: "in",
      pos: 0,
      proto: "tcp",
      dport: "443",
      action: "ACCEPT",
      comment: "HTTPS",
    });

    expect($post).toHaveBeenCalledTimes(1);
    expect($post).toHaveBeenCalledWith({
      enable: 1,
      type: "in",
      pos: 0,
      proto: "tcp",
      dport: "443",
      sport: undefined,
      comment: "HTTPS",
      action: "ACCEPT",
      "icmp-type": undefined,
      digest: undefined,
      log: "nolog",
    });
  });
});

describe("server.firewall.rules.delete", () => {
  test("it deletes a firewall rule at the given position", async () => {
    const $delete = mock(() => Promise.resolve());

    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        rules: {
          $: () => ({ $delete }),
        },
      }),
    );

    await caller.servers.firewall.rules.delete({
      server_id: mockServer.id,
      pos: 3,
      digest: "rule-digest",
    });

    expect($delete).toHaveBeenCalledTimes(1);
    expect($delete).toHaveBeenCalledWith({ digest: "rule-digest" });
  });
});

describe("server.firewall.rules.update", () => {
  test("it updates a firewall rule with log and digest", async () => {
    const $put = mock(() => Promise.resolve());

    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        rules: {
          $: () => ({ $put }),
        },
      }),
    );

    await caller.servers.firewall.rules.update({
      server_id: mockServer.id,
      pos: 2,
      action: "DROP",
      digest: "d1",
    });

    expect($put).toHaveBeenCalledTimes(1);
    expect($put).toHaveBeenCalledWith({
      enable: 0,
      delete: "type,icmp-type",
      action: "DROP",
      log: "nolog",
      digest: "d1",
    });
  });
});

describe("server.firewall.rules.move", () => {
  test("it passes moveto unchanged when moving a rule down (higher pos to lower index)", async () => {
    const $put = mock(() => Promise.resolve());

    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        rules: {
          $: () => ({ $put }),
        },
      }),
    );

    await caller.servers.firewall.rules.move({
      server_id: mockServer.id,
      pos: 5,
      moveto: 2,
      digest: "mv",
    });

    expect($put).toHaveBeenCalledWith({ moveto: 2, digest: "mv" });
  });

  test("it passes moveto + 1 when moving a rule up (lower pos to higher index)", async () => {
    const $put = mock(() => Promise.resolve());

    mock.module("../../../proxmox", () =>
      createProxmoxMock({
        rules: {
          $: () => ({ $put }),
        },
      }),
    );

    await caller.servers.firewall.rules.move({
      server_id: mockServer.id,
      pos: 2,
      moveto: 5,
      digest: "mv",
    });

    expect($put).toHaveBeenCalledWith({ moveto: 6, digest: "mv" });
  });
});
