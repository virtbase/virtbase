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
import { eq } from "@virtbase/db";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { mockServer, seedServerGraph } from "../../../testing/fixtures";

let db: TestDb;
let storeServerDeletionStep: typeof import("../store-server-deletion").storeServerDeletionStep;

const SUBNET_ID = "ipsub_0000000000000000000000001";
const ALLOCATION_ID = "ipalloc_000000000000000000001";

/** Thrown by the wrapper below to force the step's transaction to roll back. */
class ForcedRollback extends Error {}

/**
 * Whether the next `db.transaction` the step opens should be rolled back after
 * its callback returns.
 *
 * The only in-transaction failure the step has of its own is a server row that
 * disappeared mid-deletion, and that state cannot be reached from outside: the
 * allocations we want to observe are foreign-keyed to the very row that would
 * have to be missing. Forcing the rollback from the wrapper reproduces the
 * abort without having to fake an impossible database.
 */
let rollbackNextTransaction = false;

beforeAll(async () => {
  db = await createTestDb();

  // A stand-in for the real client that can abort the step's transaction. Only
  // `transaction` is intercepted; everything else is the test database.
  const client = new Proxy(db, {
    get(target, property, receiver) {
      if (property === "transaction") {
        return (
          callback: (tx: unknown) => Promise<unknown>,
          options?: unknown,
        ) =>
          // biome-ignore lint/suspicious/noExplicitAny: the drizzle transaction overloads are not worth reconstructing here
          (target as any).transaction(async (tx: unknown) => {
            const result = await callback(tx);
            if (rollbackNextTransaction) {
              rollbackNextTransaction = false;
              throw new ForcedRollback();
            }
            return result;
          }, options);
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  mock.module("@virtbase/db/client", () => ({ db: client }));
  ({ storeServerDeletionStep } = await import("../store-server-deletion"));

  await seedServerGraph(db);
  await db.insert(schema.subnets).values({
    id: SUBNET_ID,
    cidr: "203.0.113.0/24",
    gateway: "203.0.113.1",
  });
  await db.insert(schema.subnetAllocations).values({
    id: ALLOCATION_ID,
    subnetId: SUBNET_ID,
    serverId: mockServer.id,
  });
});

afterAll(async () => {
  await db.$client.close();
});

const readAllocation = () =>
  db
    .select({
      id: schema.subnetAllocations.id,
      serverId: schema.subnetAllocations.serverId,
      deallocatedAt: schema.subnetAllocations.deallocatedAt,
    })
    .from(schema.subnetAllocations)
    .where(eq(schema.subnetAllocations.id, ALLOCATION_ID))
    .limit(1)
    .then(([row]) => row);

const countServers = () =>
  db.$count(schema.servers, eq(schema.servers.id, mockServer.id));

describe("storeServerDeletionStep", () => {
  test("the deallocation is part of the deletion transaction", async () => {
    // [!] The regression. The deallocation used to run on the bare `db` handle
    // inside `db.transaction`, which commits on its own connection: an abort
    // after it - the `FatalError` for a row that vanished mid-deletion - would
    // release the customer's address while their server was still there, ready
    // to be handed to somebody else. It also deadlocks outright on a
    // single-connection driver, which is what this test sees first.
    rollbackNextTransaction = true;

    const settled = await Promise.race([
      storeServerDeletionStep({ serverId: mockServer.id }).then(
        () => "resolved" as const,
        (error) => (error instanceof ForcedRollback ? "aborted" : error),
      ),
      new Promise<string>((resolve) =>
        setTimeout(
          () =>
            resolve(
              "timed out - a bare `db` call inside `db.transaction` blocks on the connection the transaction already holds",
            ),
          5_000,
        ),
      ),
    ]);

    expect(settled).toBe("aborted");

    const allocation = await readAllocation();
    expect(allocation?.deallocatedAt).toBeNull();
    expect(await countServers()).toBe(1);
  });

  test("it deletes the server and reports its name", async () => {
    const result = await storeServerDeletionStep({ serverId: mockServer.id });

    expect(result.serverName).toBe(mockServer.name);
    expect(await countServers()).toBe(0);

    const allocation = await readAllocation();
    // `subnet_allocations.server_id` cascades, so the row goes with the server.
    // What matters is that it was deallocated in the same transaction rather
    // than on a connection of its own.
    expect(allocation).toBeUndefined();
  });
});
