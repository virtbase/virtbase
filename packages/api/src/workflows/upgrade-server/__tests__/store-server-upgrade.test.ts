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
import { eq } from "@virtbase/db";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import {
  mockServer,
  mockServerPlan,
  mockServerPlanPrice,
  seedServerGraph,
} from "../../../testing/fixtures";

let db: TestDb;
let store: typeof import("../store-server-upgrade").storeServerUpgradeStep;
let rollback: typeof import("../store-server-upgrade").rollbackStoreServerUpgradeStep;

const SERVER_ID = mockServer.id;
/** The row an upgrade mints for the plan the customer moves onto. */
const UPGRADED_PRICE_ID = "price_0000000000000000000000001";

beforeAll(async () => {
  db = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db }));
  ({ storeServerUpgradeStep: store, rollbackStoreServerUpgradeStep: rollback } =
    await import("../store-server-upgrade"));

  await seedServerGraph(db);
  await db
    .insert(schema.serverPlanPrices)
    .values({
      id: UPGRADED_PRICE_ID,
      serverPlanId: mockServerPlan.id,
      purchasePrice: 5999,
      renewalPrice: 6499,
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.$client.close();
});

beforeEach(async () => {
  await db.delete(schema.subscriptionRenewals);
  await db.delete(schema.subscriptions);
  await db
    .update(schema.servers)
    .set({ serverPlanPriceId: mockServerPlanPrice.id })
    .where(eq(schema.servers.id, SERVER_ID));
});

const subscribe = async (
  overrides: Partial<typeof schema.subscriptions.$inferInsert> = {},
) => {
  const [row] = await db
    .insert(schema.subscriptions)
    .values({
      userId: mockServer.userId,
      subjectId: SERVER_ID,
      serverPlanPriceId: mockServerPlanPrice.id,
      currentPeriodStart: new Date("2026-01-15T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-02-15T00:00:00.000Z"),
      ...overrides,
    })
    .returning();

  if (!row) throw new Error("failed to seed subscription");
  return row;
};

const priceOf = async (id: string) =>
  db
    .select({ serverPlanPriceId: schema.subscriptions.serverPlanPriceId })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, id))
    .then(([row]) => row?.serverPlanPriceId);

const upgrade = () =>
  store({
    serverId: SERVER_ID,
    serverPlanId: mockServerPlan.id,
    serverPlanPriceId: UPGRADED_PRICE_ID,
  });

describe("storeServerUpgradeStep", () => {
  test("the subscription follows the server onto the new price row", async () => {
    // Bookkeeping rather than a price change today - renewals are quoted from
    // the row locked to the *server* - but the two columns describe the same
    // agreement, and the day something prices against the subscription's copy
    // it has to already be right.
    const subscription = await subscribe();

    await upgrade();

    expect(await priceOf(subscription.id)).toBe(UPGRADED_PRICE_ID);
  });

  test("an upgrade leaves the term alone", async () => {
    // Upgrades are pro-rated: the customer pays the difference for the time
    // remaining, so neither `terminates_at` nor the billing period moves.
    const subscription = await subscribe();

    await upgrade();

    const [after] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subscription.id));

    expect(after?.currentPeriodEnd?.toISOString()).toBe(
      "2026-02-15T00:00:00.000Z",
    );
  });

  test("an ended subscription is not dragged onto the new row", async () => {
    // A subject that has been let go can be sold a new subscription later, and
    // the closed one is the record of what the *previous* agreement was.
    const ended = await subscribe({ status: "ended" });

    await upgrade();

    expect(await priceOf(ended.id)).toBe(mockServerPlanPrice.id);
  });

  test("a server with no subscription upgrades without one", async () => {
    await upgrade();

    const [server] = await db
      .select({ serverPlanPriceId: schema.servers.serverPlanPriceId })
      .from(schema.servers)
      .where(eq(schema.servers.id, SERVER_ID));

    expect(server?.serverPlanPriceId).toBe(UPGRADED_PRICE_ID);
    expect(await db.$count(schema.subscriptions)).toBe(0);
  });
});

describe("rollbackStoreServerUpgradeStep", () => {
  test("the subscription goes back with the server", async () => {
    const subscription = await subscribe();

    await upgrade();
    await rollback({
      serverId: SERVER_ID,
      previousServerPlanId: mockServerPlan.id,
      previousServerPlanPriceId: mockServerPlanPrice.id,
    });

    expect(await priceOf(subscription.id)).toBe(mockServerPlanPrice.id);
  });
});
