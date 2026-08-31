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

import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * The identity, not the memo.
 *
 * `verifySession` is wrapped in React's `cache`, which would hand every case
 * below the first one's answer - so an admin test running after a customer
 * test would pass for the wrong reason.
 *
 * Spread over the real module rather than replacing it: `mock.module` is
 * process-wide in bun, and a bare `{ cache }` takes `createContext` away from
 * every component suite that happens to run after this file.
 */
import * as actualReact from "react";

mock.module("react", () => ({
  ...actualReact,
  default: actualReact,
  cache: (fn: (...args: never) => unknown) => fn,
}));

mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));

/**
 * The two refusals, as throws.
 *
 * In Next both of these throw a control-flow signal rather than returning, so
 * a test asserting "the caller never got past this line" has to see something
 * thrown. The distinct messages are what let the assertions tell the 401 from
 * the 404 — the difference is deliberate in `verify-session.ts`: an
 * authenticated non-admin is shown a 404, so the admin surface does not
 * confirm its own existence to somebody who may not use it.
 */
mock.module("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  unauthorized: () => {
    throw new Error("NEXT_UNAUTHORIZED");
  },
}));

let currentSession: unknown = null;

mock.module("@/lib/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => currentSession,
    },
  },
}));

const { verifySession } = await import("../verify-session");

const sessionFor = (role: string) => ({
  session: { id: "sess_1", userId: "usr_1" },
  user: { id: "usr_1", email: "someone@example.com", name: "Someone", role },
});

beforeEach(() => {
  currentSession = null;
});

describe("verifySession", () => {
  test("it refuses a request with no session", async () => {
    currentSession = null;

    await expect(verifySession()).rejects.toThrow("NEXT_UNAUTHORIZED");
  });

  test("it refuses a signed-in customer with a 404, not a 401", async () => {
    currentSession = sessionFor("CUSTOMER");

    // The whole point of the distinction: a customer who guesses the URL is
    // told the page does not exist, not that they are not allowed on it.
    await expect(verifySession()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  test("it refuses a user with no role at all", async () => {
    currentSession = { ...sessionFor("CUSTOMER"), user: { id: "usr_1" } };

    await expect(verifySession()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  test("it admits an admin and hands back the session", async () => {
    currentSession = sessionFor("ADMIN");

    await expect(verifySession()).resolves.toMatchObject({
      user: { id: "usr_1", role: "ADMIN" },
    });
  });
});
