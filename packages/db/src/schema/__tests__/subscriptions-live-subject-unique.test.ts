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
  test,
} from "bun:test";
import { eq } from "drizzle-orm";
import {
  proxmoxNodeGroups,
  serverPlanPrices,
  serverPlans,
  subscriptionRenewals,
  subscriptions,
  users,
} from "../../schema";
import type { TestDb } from "../../test-client";
import { createTestDb } from "../../test-client";

let testDb: TestDb;

const USER_ID = "usr_00000000000000000000000011";
const NODE_GROUP_ID = "png_subject";
const PLAN_ID = "pck_subject";
const PRICE_ID = "price_subject";
const SERVER_ID = "srv_subject";
const OTHER_SERVER_ID = "srv_subject_other";

const PERIOD_START = new Date("2026-09-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-10-01T00:00:00.000Z");

beforeAll(async () => {
  testDb = await createTestDb();
});

afterAll(async () => {
  await testDb.$client.close();
});

beforeEach(async () => {
  // Reverse foreign-key order, so every test starts from the same database.
  await testDb.delete(subscriptionRenewals);
  await testDb.delete(subscriptions);
  await testDb.delete(serverPlanPrices);
  await testDb.delete(serverPlans);
  await testDb.delete(proxmoxNodeGroups);
  await testDb.delete(users);

  await testDb.insert(users).values({
    id: USER_ID,
    name: "Subject Test",
    email: "subject@example.com",
    emailVerified: true,
  } as never);

  await testDb
    .insert(proxmoxNodeGroups)
    .values({ id: NODE_GROUP_ID, name: "Subject Group" });

  await testDb.insert(serverPlans).values({
    id: PLAN_ID,
    proxmoxNodeGroupId: NODE_GROUP_ID,
    name: "VPS Small",
    cores: 1,
    memory: 1_024,
    storage: 20,
    price: 500,
  });

  await testDb.insert(serverPlanPrices).values({
    id: PRICE_ID,
    serverPlanId: PLAN_ID,
    purchasePrice: 500,
    renewalPrice: 500,
  });
});

/**
 * `async` rather than returning the query builder directly: a builder is a
 * thenable, not a promise, and `expect(...).rejects` silently declines to
 * inspect one.
 */
const subscribe = async (
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
) =>
  testDb.insert(subscriptions).values({
    userId: USER_ID,
    subjectId: SERVER_ID,
    serverPlanPriceId: PRICE_ID,
    currentPeriodStart: PERIOD_START,
    currentPeriodEnd: PERIOD_END,
    ...overrides,
  });

/**
 * One live subscription per thing being paid for.
 *
 * Two of them against one server bill the customer twice every month, each
 * unaware of the other, and each pushing `terminates_at` out on top of the
 * other's extension — so the machine outlives what was bought while the money
 * leaves twice. Neither row looks wrong on its own, which is why this has to
 * be impossible rather than merely unlikely.
 *
 * The index is partial on `status <> 'ended'` on purpose. A plain unique on
 * `(subject_type, subject_id)` would let a server be subscribed once in its
 * life and then be poisoned by its own history: the customer who cancels in
 * March and comes back in June is refused by a row that has been dead for
 * three months. The partial predicate is what makes the table a history
 * rather than a registry, so it gets a test of its own.
 */
describe("subscriptions - one live subscription per subject", () => {
  test("rejects a second live subscription for the same server", async () => {
    await subscribe();

    await expect(subscribe()).rejects.toThrow();

    const rows = await testDb
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.subjectId, SERVER_ID));

    expect(rows).toHaveLength(1);
  });

  test("rejects a second live subscription in any non-terminal status", async () => {
    // `cancelled` still owns the subject: the customer keeps what they paid
    // for until the period runs out, so selling that server again before then
    // is the same double-billing by another name.
    await subscribe({ status: "cancelled", cancelledAt: new Date() });

    await expect(subscribe()).rejects.toThrow();
  });

  test("allows a new subscription once the previous one has ended", async () => {
    await subscribe();

    await testDb
      .update(subscriptions)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(subscriptions.subjectId, SERVER_ID));

    await subscribe({
      currentPeriodStart: PERIOD_END,
      currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
    });

    const rows = await testDb
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.subjectId, SERVER_ID));

    // The dead row stays: the last renewal, the last invoice and any dispute
    // over either are all about a subscription that has since ended.
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.status !== "ended")).toHaveLength(1);
  });

  test("keeps two servers' subscriptions apart", async () => {
    await subscribe();
    await subscribe({ subjectId: OTHER_SERVER_ID });

    const rows = await testDb.select().from(subscriptions);

    expect(rows).toHaveLength(2);
  });

  test("rejects a period that ends before it starts", async () => {
    // A backwards period makes the due-sweep fire the instant the row is
    // written, and the renewal claim take a key it can never advance past -
    // a subscription that collects immediately and then never again.
    await expect(
      subscribe({
        currentPeriodStart: PERIOD_END,
        currentPeriodEnd: PERIOD_START,
      }),
    ).rejects.toThrow();
  });

  test("rejects a period of zero length", async () => {
    // The off-by-one that a `>=` check would let through. A period that starts
    // and ends at the same instant is already over when it is written, so the
    // customer is billed for nothing and billed again on the next sweep.
    await expect(
      subscribe({
        currentPeriodStart: PERIOD_START,
        currentPeriodEnd: PERIOD_START,
      }),
    ).rejects.toThrow();
  });
});
