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
  test,
} from "bun:test";
import { TRPCError } from "@trpc/server";
import { eq } from "@virtbase/db";
import { users } from "@virtbase/db/schema";
import { appRouter } from "../../root";
import type { TestCallerResult } from "../../testing";
import { createTestCaller, mockSession } from "../../testing";

const USER_ID = mockSession.user.id;

let harness: TestCallerResult;
let testDb: TestCallerResult["db"];

/**
 * A caller that authenticates the way the public API does: an API key in the
 * header and no session at all.
 *
 * `verifyApiKey` is stubbed because Better Auth's own verification is not what
 * is under test here - the question is what the middleware does *after* a key
 * comes back valid, which for a banned customer used to be "carry on".
 */
const apiKeyCaller = () =>
  appRouter.createCaller({
    db: testDb as never,
    authApi: {
      verifyApiKey: async () => ({
        valid: true,
        error: null,
        key: { referenceId: USER_ID },
      }),
    } as never,
    apiKey: "vb_test_key",
    headers: harness.headers,
    setHeader: () => {},
    session: null,
  });

const setUser = async (values: Partial<typeof users.$inferInsert>) => {
  await testDb.update(users).set(values).where(eq(users.id, USER_ID));
};

beforeAll(async () => {
  harness = await createTestCaller();
  testDb = harness.db;

  await testDb.insert(users).values(mockSession.user).onConflictDoNothing();
});

afterEach(async () => {
  await setUser({
    banned: false,
    banExpires: null,
    offboardingStartedAt: null,
    anonymizedAt: null,
  });
});

afterAll(async () => {
  await harness.close();
});

describe("API key authentication", () => {
  test("a key belonging to an ordinary customer works", async () => {
    const result = await apiKeyCaller().sshKeys.list({});

    expect(result.ssh_keys).toEqual([]);
  });

  test("a key belonging to a banned customer is refused", async () => {
    // Banning deletes sessions, which is the whole of Better Auth's ban
    // enforcement. A key that survived it would leave an abusive customer
    // holding the console, the firewall and the power switch.
    await setUser({ banned: true });

    expect(apiKeyCaller().sshKeys.list({})).rejects.toThrow(
      new TRPCError({ code: "UNAUTHORIZED" }),
    );
  });

  test("a ban that has already expired does not refuse it", async () => {
    // Mirrors Better Auth, which treats a lapsed `banExpires` as no ban at all
    // rather than as a ban nobody remembered to lift.
    await setUser({ banned: true, banExpires: new Date(Date.now() - 1000) });

    const result = await apiKeyCaller().sshKeys.list({});

    expect(result.ssh_keys).toEqual([]);
  });

  test("a ban that has not expired yet refuses it", async () => {
    await setUser({ banned: true, banExpires: new Date(Date.now() + 60_000) });

    expect(apiKeyCaller().sshKeys.list({})).rejects.toThrow(
      new TRPCError({ code: "UNAUTHORIZED" }),
    );
  });

  test("a key belonging to an account being offboarded is refused", async () => {
    // Its servers are already being destroyed; there is nothing left to drive.
    await setUser({ offboardingStartedAt: new Date() });

    expect(apiKeyCaller().sshKeys.list({})).rejects.toThrow(
      new TRPCError({ code: "UNAUTHORIZED" }),
    );
  });

  test("a key belonging to an anonymised account is refused", async () => {
    await setUser({ anonymizedAt: new Date() });

    expect(apiKeyCaller().sshKeys.list({})).rejects.toThrow(
      new TRPCError({ code: "UNAUTHORIZED" }),
    );
  });

  test("a pending deletion does not refuse it", async () => {
    // Deliberate: a customer inside the grace period can still sign in, so
    // their key keeps working too. Cutting the API off days before the account
    // goes would be a silent outage with no explanation attached.
    await setUser({
      deletionRequestedAt: new Date(),
      deletionScheduledAt: new Date(Date.now() + 86_400_000),
    });

    const result = await apiKeyCaller().sshKeys.list({});

    expect(result.ssh_keys).toEqual([]);

    await setUser({ deletionRequestedAt: null, deletionScheduledAt: null });
  });

  test("a key whose owner no longer exists is refused", async () => {
    await testDb.delete(users).where(eq(users.id, USER_ID));

    expect(apiKeyCaller().sshKeys.list({})).rejects.toThrow(
      new TRPCError({ code: "UNAUTHORIZED" }),
    );

    await testDb.insert(users).values(mockSession.user).onConflictDoNothing();
  });
});
