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
import {
  paymentMethods,
  proxmoxNodeGroups,
  serverPlanPrices,
  serverPlans,
  subscriptions,
  users,
} from "../../schema";
import type { TestDb } from "../../test-client";
import { createTestDb } from "../../test-client";

let testDb: TestDb;

const USER_ID = "usr_00000000000000000000000020";
const OTHER_USER_ID = "usr_00000000000000000000000021";
const PRICE_ID = "price_0000000000000000000000020";

beforeAll(async () => {
  testDb = await createTestDb();
});

afterAll(async () => {
  await testDb.$client.close();
});

beforeEach(async () => {
  // Reverse foreign-key order, so every test starts from the same database.
  await testDb.delete(subscriptions);
  await testDb.delete(paymentMethods);
  await testDb.delete(serverPlanPrices);
  await testDb.delete(serverPlans);
  await testDb.delete(proxmoxNodeGroups);
  await testDb.delete(users);

  await testDb.insert(users).values([
    {
      id: USER_ID,
      name: "Card Owner",
      email: "owner@example.com",
      emailVerified: true,
    },
    {
      id: OTHER_USER_ID,
      name: "Someone Else",
      email: "someone-else@example.com",
      emailVerified: true,
    },
  ] as never);

  await testDb
    .insert(proxmoxNodeGroups)
    .values({ id: "png_00000000000000000000000020", name: "Test group" });

  await testDb.insert(serverPlans).values({
    id: "pck_00000000000000000000000020",
    proxmoxNodeGroupId: "png_00000000000000000000000020",
    name: "Test plan",
    cores: 1,
    memory: 1024,
    storage: 10,
    price: 1000,
  });

  await testDb.insert(serverPlanPrices).values({
    id: PRICE_ID,
    serverPlanId: "pck_00000000000000000000000020",
    purchasePrice: 1000,
    renewalPrice: 1000,
  });
});

/**
 * `async` rather than returning the query builder directly: a builder is a
 * thenable, not a promise, and `expect(...).rejects` silently declines to
 * inspect one.
 */
const attach = async (userId: string, id: string) =>
  testDb.insert(paymentMethods).values({
    id,
    userId,
    provider: "stripe",
    externalId: `pm_stripe_${id}`,
    type: "card",
    brand: "visa",
    last4: "4242",
  });

const subscribe = async (
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
) =>
  testDb.insert(subscriptions).values({
    userId: USER_ID,
    subjectType: "server",
    subjectId: "srv_00000000000000000000000020",
    serverPlanPriceId: PRICE_ID,
    currentPeriodStart: new Date("2026-08-01T00:00:00Z"),
    currentPeriodEnd: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  });

/**
 * The invariant behind a wrong-person charge.
 *
 * Billing the right customer twice costs a refund and a support thread.
 * Billing the *wrong* customer once costs their trust and, in the EU, a
 * chargeback that arrives with a regulator's vocabulary attached. Everything
 * upstream of this - the collector, the router, the admin tools - passes a
 * payment method id and a user id around separately, so any one of them
 * crossing the two would do it. The pairing is therefore the database's
 * problem rather than each caller's.
 */
describe("subscriptions - the card must belong to the customer", () => {
  test("rejects a subscription naming another customer's card", async () => {
    await attach(OTHER_USER_ID, "pm_00000000000000000000000099");

    await expect(
      subscribe({ paymentMethodId: "pm_00000000000000000000000099" }),
    ).rejects.toThrow();
  });

  test("accepts a subscription naming the customer's own card", async () => {
    await attach(USER_ID, "pm_00000000000000000000000098");

    await subscribe({ paymentMethodId: "pm_00000000000000000000000098" });

    const [row] = await testDb.select().from(subscriptions);
    expect(row?.paymentMethodId).toBe("pm_00000000000000000000000098");
  });

  /**
   * Null means "whatever is default at collection time". A composite foreign
   * key is not enforced when any of its columns is null, which is exactly the
   * behaviour wanted here - and worth pinning down, because it is the one case
   * where the constraint deliberately does nothing.
   */
  test("allows no card at all", async () => {
    await subscribe({ paymentMethodId: null });

    const [row] = await testDb.select().from(subscriptions);
    expect(row?.paymentMethodId).toBeNull();
  });

  test("rejects a card id that does not exist", async () => {
    await expect(
      subscribe({ paymentMethodId: "pm_00000000000000000000000097" }),
    ).rejects.toThrow();
  });
});
