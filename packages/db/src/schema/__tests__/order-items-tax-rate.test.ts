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
import { orderItems, orders, users } from "../../schema";
import type { TestDb } from "../../test-client";
import { createTestDb } from "../../test-client";

let testDb: TestDb;

const USER_ID = "usr_00000000000000000000000009";

beforeAll(async () => {
  testDb = await createTestDb();
});

afterAll(async () => {
  await testDb.$client.close();
});

beforeEach(async () => {
  await testDb.delete(orderItems);
  await testDb.delete(orders);
  await testDb.delete(users);

  await testDb.insert(users).values({
    id: USER_ID,
    name: "Test",
    email: "tax@example.com",
    emailVerified: true,
  } as never);
});

const seedItem = async (taxRatePercentage: number | null) => {
  const [order] = await testDb
    .insert(orders)
    .values({
      userId: USER_ID,
      type: "new_server",
      totalAmount: 1_190,
      configuration: { version: 2 },
    })
    .returning({ id: orders.id });

  if (!order) throw new Error("failed to seed order");

  const [item] = await testDb
    .insert(orderItems)
    .values({
      orderId: order.id,
      name: "VPS Small",
      unitAmount: 1_190,
      taxRatePercentage,
    })
    .returning({ id: orderItems.id });

  if (!item) throw new Error("failed to seed order item");

  return testDb
    .select({ rate: orderItems.taxRatePercentage })
    .from(orderItems)
    .where(eq(orderItems.id, item.id))
    .then(([row]) => row?.rate);
};

describe("orderItems.taxRatePercentage", () => {
  test("stores a fractional rate exactly", async () => {
    // Finland charges 25.5%. An `int4` column rejected it outright, so every
    // Finnish order failed after the customer had already been charged.
    expect(await seedItem(25.5)).toBe(25.5);
  });

  test("still reads a whole rate back as a number, not a string", async () => {
    // `numeric` comes back as a string unless the column asks for a number,
    // and every consumer of this value - the invoice port, the Lexware
    // adapter, the privacy export - is typed `number`.
    const rate = await seedItem(19);

    expect(rate).toBe(19);
    expect(typeof rate).toBe("number");
  });

  test("keeps zero distinguishable from unknown", async () => {
    expect(await seedItem(0)).toBe(0);
    expect(await seedItem(null)).toBeNull();
  });

  test("holds every configured EU rate without rounding", async () => {
    // The table has one non-integer entry today; the column must not care
    // which, so the guard is against a rate being silently rounded rather
    // than against Finland specifically.
    for (const rate of [17, 18, 19, 20, 21, 22, 23, 24, 25, 25.5, 27]) {
      expect(await seedItem(rate)).toBe(rate);
    }
  });
});
