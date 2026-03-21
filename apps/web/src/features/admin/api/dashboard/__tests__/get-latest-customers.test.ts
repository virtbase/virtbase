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

import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("react", () => ({
  cache: (fn: (...args: never) => unknown) => fn,
}));
mock.module("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
mock.module("@sentry/nextjs", () => ({ captureException: () => {} }));
mock.module("../../verify-session", () => ({
  verifySession: async () => {},
}));

import { users } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { mockUser } from "./fixtures";

let testDb: TestDb;
let getLatestCustomers: typeof import("../get-latest-customers").getLatestCustomers;

beforeAll(async () => {
  testDb = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db: testDb }));

  const mod = await import("../get-latest-customers");
  getLatestCustomers = mod.getLatestCustomers;
});

afterEach(async () => {
  await testDb.delete(users);
});

describe("getLatestCustomers", () => {
  test("it returns an empty array when no customers exist", async () => {
    const result = await getLatestCustomers();

    expect(result).toEqual([]);
  });

  test("it returns customers with the correct fields", async () => {
    await testDb.insert(users).values(mockUser);

    const result = await getLatestCustomers();

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe(mockUser.name);
    expect(result[0]?.email).toBe(mockUser.email);
  });

  test("it excludes non-customer roles", async () => {
    await testDb.insert(users).values([
      mockUser,
      {
        ...mockUser,
        id: "usr_0000000000000000000000010",
        email: "admin@example.com",
        role: "ADMIN",
      },
    ]);

    const result = await getLatestCustomers();

    expect(result).toHaveLength(1);
    expect(result[0]?.email).toBe(mockUser.email);
  });

  test("it limits results to 5 and orders by id descending", async () => {
    const customerValues = Array.from({ length: 7 }, (_, i) => ({
      ...mockUser,
      id: `usr_000000000000000000000000${i + 1}`,
      email: `customer${i + 1}@example.com`,
      name: `Customer ${i + 1}`,
    }));

    await testDb.insert(users).values(customerValues);

    const result = await getLatestCustomers();

    expect(result).toHaveLength(5);
    expect(result[0]?.name).toBe("Customer 7");
    expect(result[4]?.name).toBe("Customer 3");
  });
});
