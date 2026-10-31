/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "@virtbase/db";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import type { ProxmoxInstance } from "../../proxmox";
import {
  mockProxmoxNode,
  mockServer,
  mockServerPlanPrice,
  mockSession,
  seedServerGraph,
} from "../../testing/fixtures";
import type { NodeBatch, SuspensionNode } from "../suspend-terminated-servers";

type Module = typeof import("../suspend-terminated-servers");

let db: TestDb;
let suspendTerminatedServers: Module["suspendTerminatedServers"];
let groupByNode: Module["groupByNode"];
let powerOffServers: Module["powerOffServers"];

const SECOND_NODE = {
  ...mockProxmoxNode,
  id: "pn_0000000000000000000000001",
  hostname: "second-node.example.com",
  fqdn: "second-node.example.com",
};

const SECOND_SERVER = {
  ...mockServer,
  id: "kvm_0000000000000000000000001",
  proxmoxNodeId: SECOND_NODE.id,
  vmid: 101,
};

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

const readSuspendedAt = async (serverId: string) =>
  db
    .select({ suspendedAt: schema.servers.suspendedAt })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .then(([row]) => row?.suspendedAt ?? null);

const neverSettles = () => new Promise<void>(() => {});

beforeAll(async () => {
  db = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db }));
  ({ suspendTerminatedServers, groupByNode, powerOffServers } = await import(
    "../suspend-terminated-servers"
  ));
});

beforeEach(async () => {
  await db.delete(schema.subscriptions);
  await db.delete(schema.servers);
  await seedServerGraph(db);
  await db
    .insert(schema.proxmoxNodes)
    .values(SECOND_NODE)
    .onConflictDoNothing();
  await db.insert(schema.servers).values(SECOND_SERVER);
  await db
    .update(schema.servers)
    .set({ terminatesAt: hoursAgo(1), suspendedAt: null });
});

describe("suspendTerminatedServers", () => {
  test("suspends the servers of every reachable node when another node fails", async () => {
    // [!] Risk C16: one failing node used to reject a single Promise.all
    // before any server was marked suspended, stalling the whole fleet.
    const result = await suspendTerminatedServers({
      powerOff: async ({ node }: NodeBatch) => {
        if (node.proxmoxNodeId === mockProxmoxNode.id) {
          throw new Error("node unreachable");
        }
      },
    });

    expect(result.suspendedServerIds).toEqual([SECOND_SERVER.id]);
    expect(result.failedServerIds).toEqual([mockServer.id]);
    expect(result.failedNodeIds).toEqual([mockProxmoxNode.id]);
    expect(await readSuspendedAt(SECOND_SERVER.id)).toBeInstanceOf(Date);
    expect(await readSuspendedAt(mockServer.id)).toBeNull();
  });

  test("gives up on a node that hangs and suspends the others", async () => {
    const result = await suspendTerminatedServers({
      timeoutMs: 50,
      powerOff: ({ node }: NodeBatch) =>
        node.proxmoxNodeId === mockProxmoxNode.id
          ? neverSettles()
          : Promise.resolve(),
    });

    expect(result.suspendedServerIds).toEqual([SECOND_SERVER.id]);
    expect(result.failedNodeIds).toEqual([mockProxmoxNode.id]);
  });

  test("leaves the servers of a failed node due, so the next run suspends them", async () => {
    await suspendTerminatedServers({
      powerOff: async () => {
        throw new Error("node unreachable");
      },
    });
    const powered: string[] = [];

    const result = await suspendTerminatedServers({
      powerOff: async ({ servers }: NodeBatch) => {
        powered.push(...servers.map((server) => server.id));
      },
    });

    expect(powered.sort()).toEqual([mockServer.id, SECOND_SERVER.id]);
    expect(result.suspendedServerIds.sort()).toEqual(powered);
  });

  test("handles at most `limit` servers per run, oldest term first", async () => {
    await db
      .update(schema.servers)
      .set({ terminatesAt: hoursAgo(2) })
      .where(eq(schema.servers.id, SECOND_SERVER.id));

    const result = await suspendTerminatedServers({
      limit: 1,
      powerOff: async () => {},
    });

    expect(result.suspendedServerIds).toEqual([SECOND_SERVER.id]);
  });

  test("does not power off a server that is already suspended", async () => {
    await suspendTerminatedServers({ powerOff: async () => {} });
    let calls = 0;

    const result = await suspendTerminatedServers({
      powerOff: async () => {
        calls += 1;
      },
    });

    expect(calls).toBe(0);
    expect(result.suspendedServerIds).toEqual([]);
  });

  test("moves the subscription of a server an earlier run suspended without it", async () => {
    await db
      .update(schema.servers)
      .set({ suspendedAt: hoursAgo(1) })
      .where(eq(schema.servers.id, mockServer.id));
    await db.insert(schema.subscriptions).values({
      userId: mockSession.user.id,
      subjectId: mockServer.id,
      serverPlanPriceId: mockServerPlanPrice.id,
      status: "active",
      autoRenew: false,
      currentPeriodStart: hoursAgo(24 * 30),
      currentPeriodEnd: hoursAgo(1),
    });

    const result = await suspendTerminatedServers({ powerOff: async () => {} });
    const [subscription] = await db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.subjectId, mockServer.id));

    expect(subscription?.status).toBe("suspended");
    expect(result.subscriptionsSuspended).toBe(1);
  });
});

describe("groupByNode", () => {
  const node = (id: string): SuspensionNode => ({
    proxmoxNodeId: id,
    hostname: id,
    fqdn: id,
    tokenID: "",
    tokenSecret: "",
  });

  test("groups servers by node, in the order the nodes first appear", () => {
    const batches = groupByNode([
      { id: "kvm_b1", vmid: 1, node: node("b") },
      { id: "kvm_a1", vmid: 2, node: node("a") },
      { id: "kvm_b2", vmid: 3, node: node("b") },
    ]);

    expect(
      batches.map(({ node, servers }) => [
        node.proxmoxNodeId,
        servers.map((s) => s.id),
      ]),
    ).toEqual([
      ["b", ["kvm_b1", "kvm_b2"]],
      ["a", ["kvm_a1"]],
    ]);
  });
});

describe("powerOffServers", () => {
  /** A Proxmox client reduced to the two calls the power-off makes. */
  const createInstance = ({
    failingVmids = [],
    shutdownFails = false,
    shutdowns,
  }: {
    failingVmids?: number[];
    shutdownFails?: boolean;
    shutdowns: number[][];
  }) =>
    ({
      node: {
        qemu: {
          $: (vmid: number) => ({
            config: {
              $put: async () => {
                if (failingVmids.includes(vmid))
                  throw new Error("config failed");
              },
            },
          }),
        },
      },
      cluster: {
        "bulk-action": {
          guest: {
            shutdown: {
              $post: async ({ vms }: { vms: number[] }) => {
                if (shutdownFails) throw new Error("shutdown failed");
                shutdowns.push(vms);
              },
            },
          },
        },
      },
    }) as unknown as ProxmoxInstance;

  const due = [
    { id: "kvm_1", vmid: 100 },
    { id: "kvm_2", vmid: 101 },
  ];

  test("shuts every server down although disabling one autostart failed", async () => {
    const shutdowns: number[][] = [];

    await powerOffServers(
      createInstance({ failingVmids: [100], shutdowns }),
      due,
    );

    expect(shutdowns).toEqual([[100, 101]]);
  });

  test("rejects when the bulk shutdown fails", async () => {
    const instance = createInstance({ shutdownFails: true, shutdowns: [] });

    await expect(powerOffServers(instance, due)).rejects.toThrow(
      "shutdown failed",
    );
  });
});
