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

import type { Session } from "@virtbase/auth";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { appRouter } from "../root";
import { mockSession } from "./fixtures";

export type TestCaller = ReturnType<typeof appRouter.createCaller>;

export interface TestCallerOptions {
  /**
   * The session backing the authenticated caller. Defaults to
   * {@link mockSession}; pass `mockAdminSession` for the admin role.
   */
  session?: Session;
  /**
   * Stub for the better-auth API. Only the API-key path touches it, so the
   * default is deliberately an empty object that throws if a test wanders in
   * there without saying so.
   */
  authApi?: unknown;
  /** An API key to send instead of a session, for the API-key middleware. */
  apiKey?: string | null;
  headers?: Headers;
}

export interface TestCallerResult {
  db: TestDb;
  /** Caller carrying `options.session`. */
  caller: TestCaller;
  /** Caller with no session and no API key, for authorization assertions. */
  unauthenticatedCaller: TestCaller;
  /** Headers passed to both callers, mutable for per-test tweaks. */
  headers: Headers;
  /** Close the PGlite connection. Call from `afterAll`. */
  close: () => Promise<void>;
}

/**
 * Spin up a PGlite database and a pair of tRPC callers over it.
 *
 * Every router test was repeating the same twenty lines: `createTestDb()`, a
 * `sharedContext` literal full of `as never` casts, two `createCaller` calls and
 * a teardown that closes the client. That block is here once instead.
 *
 * The database is per-call, so files stay isolated from each other. Rows do not
 * roll back between tests within a file - clean up in `afterEach` where a test
 * writes.
 */
export async function createTestCaller({
  session = mockSession,
  authApi = {},
  apiKey = null,
  headers = new Headers(),
}: TestCallerOptions = {}): Promise<TestCallerResult> {
  const db = await createTestDb();

  const sharedContext = {
    db: db as never,
    authApi: authApi as never,
    apiKey,
    headers,
    setHeader: () => {},
  };

  return {
    db,
    headers,
    caller: appRouter.createCaller({ ...sharedContext, session }),
    unauthenticatedCaller: appRouter.createCaller({
      ...sharedContext,
      apiKey: null,
      session: null,
    }),
    close: async () => {
      await db.$client.close();
    },
  };
}
