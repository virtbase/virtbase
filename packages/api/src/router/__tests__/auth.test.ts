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

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { accounts, users } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { appRouter } from "../../root";
import { mockSession } from "./fixtures";

let testDb: TestDb;
let caller: ReturnType<typeof appRouter.createCaller>;
let unauthenticatedCaller: ReturnType<typeof appRouter.createCaller>;

beforeAll(async () => {
  testDb = await createTestDb();

  // Create a test user, required for linking ssh keys
  await testDb.insert(users).values(mockSession.user).onConflictDoNothing();

  const sharedContext = {
    db: testDb as never,
    authApi: {} as never,
    apiKey: null,
    lexware: null,
    headers: new Headers(),
    setHeader: () => {},
  };

  caller = appRouter.createCaller({
    ...sharedContext,
    session: mockSession,
  });

  unauthenticatedCaller = appRouter.createCaller({
    ...sharedContext,
    session: null,
  });
});

afterAll(async () => {
  await testDb.$client.close();
});

describe("auth.checkAccountExists", () => {
  test("it throws a bad request error if the user is authenticated", async () => {
    const resultPromise = caller.auth.checkAccountExists({
      email: mockSession.user.email,
    });

    expect(resultPromise).rejects.toThrow(
      new TRPCError({ code: "BAD_REQUEST" }),
    );
  });

  test("it returns false if the account does not exist", async () => {
    const result = await unauthenticatedCaller.auth.checkAccountExists({
      email: "nonexistent@example.com",
    });

    expect(result.accountExists).toBe(false);
    expect(result.hasPassword).toBe(false);
  });

  test("it returns true if the account exists", async () => {
    const result = await unauthenticatedCaller.auth.checkAccountExists({
      email: mockSession.user.email,
    });

    expect(result.accountExists).toBe(true);
    expect(result.hasPassword).toBe(false);
  });

  test("it returns hasPassword true if the account has a password", async () => {
    await testDb.insert(accounts).values({
      accountId: "acc_0000000000000000000000000",
      userId: mockSession.user.id,
      providerId: "credential",
      password: "__mock_password__",
    });

    const result = await unauthenticatedCaller.auth.checkAccountExists({
      email: mockSession.user.email,
    });

    expect(result.accountExists).toBe(true);
    expect(result.hasPassword).toBe(true);
  });
});
