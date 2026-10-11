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

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "@virtbase/db";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import {
  mockProxmoxNode,
  mockServer,
  seedServerGraph,
} from "../../testing/fixtures";
import type { NodeBatch } from "../suspend-terminated-servers";

let db: TestDb;
let suspendTerminatedServers: typeof import("../suspend-terminated-servers").suspendTerminatedServers;

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

const pastTerm = () => new Date(Date.now() - 60 * 60 * 1000);

const readSuspendedAt = async (serverId: string) =>
  db
    .select({ suspendedAt: schema.servers.suspendedAt })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .then(([row]) => row?.suspendedAt ?? null);

beforeAll(async () => {
  db = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db }));
  ({ suspendTerminatedServers } = await import(
    "../suspend-terminated-servers"
  ));
});

beforeEach(async () => {
  await db.delete(schema.servers);
  await seedServerGraph(db);
  await db
    .insert(schema.proxmoxNodes)
    .values(SECOND_NODE)
    .onConflictDoNothing();
  await db.insert(schema.servers).values(SECOND_SERVER);
  await db
    .update(schema.servers)
    .set({ terminatesAt: pastTerm(), suspendedAt: null });
});

describe("suspendTerminatedServers", () => {
  test("suspends the servers of every reachable node when another node fails", async () => {
    const result = await suspendTerminatedServers({
      powerOff: async ({ node }: NodeBatch) => {
        if (node.proxmoxNodeId === mockProxmoxNode.id) {
          throw new Error("node unreachable");
        }
      },
    });

    expect(result).toEqual({
      suspendedServerIds: [SECOND_SERVER.id],
      failedNodeIds: [mockProxmoxNode.id],
    });
    expect(await readSuspendedAt(SECOND_SERVER.id)).toBeInstanceOf(Date);
    expect(await readSuspendedAt(mockServer.id)).toBeNull();
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
      .set({ terminatesAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
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
    expect(result).toEqual({ suspendedServerIds: [], failedNodeIds: [] });
  });
});
