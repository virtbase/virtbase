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

import { beforeEach, describe, expect, test } from "bun:test";
import { orders, payments, serverBackups, servers } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import {
  mockDatacenter,
  mockProxmoxNode,
  mockServer,
  mockSession,
  seedServerGraph,
} from "../../testing";
import type { PLATFORM_METRICS_TRANSACTION } from "../db-platform-metrics";
import { createDbPlatformMetrics } from "../db-platform-metrics";

const READ_AT = new Date("2026-10-11T12:00:00Z");
const hoursBefore = (hours: number) =>
  new Date(READ_AT.getTime() - hours * 3_600_000);

let testDb: TestDb;

const readMetrics = () =>
  createDbPlatformMetrics({ db: testDb, now: () => READ_AT }).read();

const backup = (
  id: string,
  values: Partial<typeof serverBackups.$inferInsert>,
) =>
  testDb.insert(serverBackups).values({
    id,
    serverId: mockServer.id,
    name: id,
    upid: `UPID:${id}`,
    startedAt: hoursBefore(1),
    ...values,
  });

const order = (id: string, values: Partial<typeof orders.$inferInsert>) =>
  testDb.insert(orders).values({
    id,
    userId: mockSession.user.id,
    type: "new_server",
    totalAmount: 1190,
    configuration: {},
    ...values,
  });

const payment = (id: string, values: Partial<typeof payments.$inferInsert>) =>
  testDb.insert(payments).values({
    id,
    userId: mockSession.user.id,
    provider: "stripe",
    externalId: id,
    amount: 1190,
    ...values,
  });

beforeEach(async () => {
  testDb = await createTestDb();
  await seedServerGraph(testDb);
});

describe("DbPlatformMetrics", () => {
  test("reads an empty platform as zero for every state", async () => {
    await testDb.delete(servers);

    const snapshot = await readMetrics();

    expect(snapshot.servers).toEqual({
      active: 0,
      installing: 0,
      suspended: 0,
      terminating: 0,
    });
    expect(snapshot.backups).toEqual({ running: 0, failed: 0, completed: 0 });
    expect(snapshot.allocations).toEqual({ allocated: 0, released: 0 });
    expect(Object.values(snapshot.orders).every((total) => total === 0)).toBe(
      true,
    );
    expect(snapshot.orders).toHaveProperty("fulfilling", 0);
    expect(snapshot.payments).toHaveProperty("succeeded", 0);
    expect(snapshot.serversPerNode).toEqual([]);
    expect(snapshot.oldestUnsettledBackupAt).toBeNull();
    expect(snapshot.oldestInFlightOrderAt).toBeNull();
    expect(snapshot.paymentAmounts).toEqual([]);
  });

  test("collapses each server to one lifecycle state", async () => {
    await testDb.insert(servers).values([
      {
        ...mockServer,
        id: "kvm_0000000000000000000000001",
        vmid: 101,
        installedAt: null,
        terminatesAt: null,
      },
      {
        ...mockServer,
        id: "kvm_0000000000000000000000002",
        vmid: 102,
        suspendedAt: hoursBefore(1),
      },
      {
        ...mockServer,
        id: "kvm_0000000000000000000000003",
        vmid: 103,
        terminatesAt: null,
      },
    ]);

    const snapshot = await readMetrics();

    expect(snapshot.servers).toEqual({
      active: 1,
      installing: 1,
      suspended: 1,
      terminating: 1,
    });
    expect(snapshot.serversPerNode).toEqual([
      {
        node: mockProxmoxNode.hostname,
        datacenter: mockDatacenter.name,
        total: 4,
      },
    ]);
    expect(snapshot.nodesPerDatacenter).toEqual([
      { datacenter: mockDatacenter.name, total: 1 },
    ]);
    expect(snapshot.users).toBe(1);
  });

  test("counts backups by state, and dates the oldest one still running", async () => {
    await backup("kbu_0000000000000000000000001", {
      startedAt: hoursBefore(5),
    });
    await backup("kbu_0000000000000000000000002", {
      startedAt: hoursBefore(2),
    });
    await backup("kbu_0000000000000000000000003", {
      finishedAt: hoursBefore(1),
      failedAt: hoursBefore(1),
    });
    await backup("kbu_0000000000000000000000004", {
      finishedAt: hoursBefore(1),
      size: 2_048,
    });
    await backup("kbu_0000000000000000000000005", {
      finishedAt: hoursBefore(1),
      size: 1_024,
    });

    const snapshot = await readMetrics();

    expect(snapshot.backups).toEqual({ running: 2, failed: 1, completed: 2 });
    expect(snapshot.completedBackupBytes).toBe(3_072);
    expect(snapshot.oldestUnsettledBackupAt).toEqual(hoursBefore(5));
  });

  test("dates the oldest order in flight, and ignores settled ones", async () => {
    await order("ord_0000000000000000000000001", {
      status: "fulfilled",
      createdAt: hoursBefore(48),
    });
    await order("ord_0000000000000000000000002", {
      status: "paid",
      createdAt: hoursBefore(3),
    });
    await order("ord_0000000000000000000000003", {
      status: "awaiting_payment",
      createdAt: hoursBefore(1),
    });

    const snapshot = await readMetrics();

    expect(snapshot.orders).toMatchObject({
      fulfilled: 1,
      paid: 1,
      awaiting_payment: 1,
      draft: 0,
    });
    expect(snapshot.oldestInFlightOrderAt).toEqual(hoursBefore(3));
  });

  test("dates an order awaiting payment as in flight when it is older than a paid one", async () => {
    await order("ord_0000000000000000000000001", {
      status: "paid",
      createdAt: hoursBefore(2),
    });
    await order("ord_0000000000000000000000002", {
      status: "awaiting_payment",
      createdAt: hoursBefore(6),
    });

    expect((await readMetrics()).oldestInFlightOrderAt).toEqual(hoursBefore(6));
  });

  test("sums captured and refunded amounts per currency, in minor units", async () => {
    await payment("pay_0000000000000000000000001", {
      status: "succeeded",
      capturedAmount: 1190,
    });
    await payment("pay_0000000000000000000000002", {
      status: "refunded",
      capturedAmount: 500,
      refundedAmount: 500,
    });
    await payment("pay_0000000000000000000000003", {
      status: "succeeded",
      capturedAmount: 2000,
      currency: "USD",
    });

    const snapshot = await readMetrics();

    expect(snapshot.payments).toMatchObject({ succeeded: 2, refunded: 1 });
    expect(
      [...snapshot.paymentAmounts].sort((a, b) =>
        a.currency.localeCompare(b.currency),
      ),
    ).toEqual([
      { currency: "EUR", captured: 1690, refunded: 500 },
      { currency: "USD", captured: 2000, refunded: 0 },
    ]);
  });

  test("stamps the snapshot with the time it was read", async () => {
    expect((await readMetrics()).readAt).toEqual(READ_AT);
  });
});

describe("createDbPlatformMetrics", () => {
  test("reads in one read-only, repeatable-read transaction", async () => {
    const opened: (typeof PLATFORM_METRICS_TRANSACTION)[] = [];

    await createDbPlatformMetrics({
      db: {
        transaction: (read, options) => {
          opened.push(options);
          return testDb.transaction(read, options);
        },
      },
    }).read();

    expect(opened).toEqual([
      { accessMode: "read only", isolationLevel: "repeatable read" },
    ]);
  });
});
