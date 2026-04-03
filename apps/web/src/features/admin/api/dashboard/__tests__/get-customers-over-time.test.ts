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
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

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
let getCustomersOverTime: typeof import("../get-customers-over-time").getCustomersOverTime;

beforeAll(async () => {
  testDb = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db: testDb }));

  const mod = await import("../get-customers-over-time");
  getCustomersOverTime = mod.getCustomersOverTime;
});

afterAll(async () => {
  await testDb.$client.close();
});

afterEach(async () => {
  await testDb.delete(users);
});

describe("getCustomersOverTime", () => {
  test("it returns 14 entries even when no customers exist", async () => {
    const result = await getCustomersOverTime();

    expect(result).toHaveLength(14);
    for (const entry of result) {
      expect(entry.count).toBe(0);
      expect(entry.date).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    }
  });

  test("it counts customers created today", async () => {
    await testDb.insert(users).values([
      mockUser,
      {
        ...mockUser,
        id: "usr_0000000000000000000000002",
        email: "customer2@example.com",
      },
    ]);

    const result = await getCustomersOverTime();

    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
    const todayEntry = result.find((e) => e.date === today);

    expect(todayEntry).toBeDefined();
    expect(todayEntry?.count).toBe(2);
  });

  test("it excludes non-customer roles from counts", async () => {
    await testDb.insert(users).values([
      mockUser,
      {
        ...mockUser,
        id: "usr_0000000000000000000000010",
        email: "admin@example.com",
        role: "ADMIN",
      },
    ]);

    const result = await getCustomersOverTime();

    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
    const todayEntry = result.find((e) => e.date === today);

    expect(todayEntry).toBeDefined();
    expect(todayEntry?.count).toBe(1);
  });

  test("it returns dates in ascending order", async () => {
    const result = await getCustomersOverTime();

    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1]?.date;
      const curr = result[i]?.date;
      expect(prev && curr && prev < curr).toBe(true);
    }
  });
});
