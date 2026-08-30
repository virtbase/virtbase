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
import type { Session } from "@virtbase/auth";
import { STEP_UP_WINDOW_SECONDS } from "@virtbase/utils";
import { mockSession } from "../../testing/fixtures";

/** A stand-in Redis, so the marker and the spent note are observable. */
const store = new Map<string, unknown>();

/**
 * Flipped by the outage test rather than re-mocking the module: `mock.module`
 * is process-wide and never undone, so a second mock installed mid-file would
 * hand a permanently broken Redis to every test file that runs after this one.
 */
let redisIsDown = false;

const refuseWhenDown = () => {
  if (redisIsDown) throw new Error("redis is down");
};

mock.module("../../upstash/redis", () => ({
  redis: {
    get: async (key: string) => {
      refuseWhenDown();
      return store.get(key) ?? null;
    },
    set: async (key: string, value: unknown) => {
      refuseWhenDown();
      store.set(key, value);
      return "OK";
    },
    del: async (key: string) => {
      refuseWhenDown();
      return store.delete(key) ? 1 : 0;
    },
  },
}));

const { grantStepUp, isStepUpSatisfied, revokeStepUp } = await import(
  "../index"
);

const sessionWith = (overrides: Partial<Session["session"]>): Session => ({
  ...mockSession,
  session: { ...mockSession.session, ...overrides },
});

const fresh = (token: string) => sessionWith({ token, createdAt: new Date() });

const stale = (token: string) =>
  sessionWith({
    token,
    createdAt: new Date(Date.now() - (STEP_UP_WINDOW_SECONDS + 60) * 1000),
  });

beforeEach(() => {
  store.clear();
  redisIsDown = false;
});

describe("isStepUpSatisfied", () => {
  test("a session created moments ago satisfies it", async () => {
    expect(await isStepUpSatisfied(fresh("tok_fresh"))).toBe(true);
  });

  test("an old session does not", async () => {
    expect(await isStepUpSatisfied(stale("tok_stale"))).toBe(false);
  });

  test("an old session with a password challenge behind it does", async () => {
    await grantStepUp("tok_challenged");

    expect(await isStepUpSatisfied(stale("tok_challenged"))).toBe(true);
  });
});

describe("impersonation", () => {
  test("an impersonated session never satisfies it, however young", async () => {
    // Better Auth mints an impersonation with `createSession`, so it is always
    // seconds old. Without this the admin who pressed Impersonate would inherit
    // the customer's step-up - and with it their export passphrase, which is
    // returned exactly once and never stored.
    const impersonated = sessionWith({
      token: "tok_impersonated",
      createdAt: new Date(),
      impersonatedBy: "usr_0000000000000000000000001",
    });

    expect(await isStepUpSatisfied(impersonated)).toBe(false);
  });

  test("not even a password challenge lets an impersonator through", async () => {
    // The challenge proves somebody knows the password. Support staff typing
    // one they were told is not the customer proving anything.
    await grantStepUp("tok_impersonated_challenge");

    const impersonated = sessionWith({
      token: "tok_impersonated_challenge",
      createdAt: new Date(),
      impersonatedBy: "usr_0000000000000000000000001",
    });

    expect(await isStepUpSatisfied(impersonated)).toBe(false);
  });

  test("the customer's own session is unaffected", async () => {
    expect(await isStepUpSatisfied(fresh("tok_owner"))).toBe(true);
  });
});

describe("one challenge, one action", () => {
  test("a fresh session stops satisfying it once it has been spent", async () => {
    // Signing in with a passkey leaves no marker to delete, so before this the
    // documented contract held only for the password path: one sign-in
    // authorised every irreversible action inside the next ten minutes.
    const session = fresh("tok_spent");

    expect(await isStepUpSatisfied(session)).toBe(true);

    await revokeStepUp(session.session.token);

    expect(await isStepUpSatisfied(session)).toBe(false);
  });

  test("spending one session does not spend another", async () => {
    await revokeStepUp("tok_other");

    expect(await isStepUpSatisfied(fresh("tok_untouched"))).toBe(true);
  });

  test("a fresh challenge re-authorises a spent session", async () => {
    const session = fresh("tok_recharged");
    await revokeStepUp(session.session.token);

    expect(await isStepUpSatisfied(session)).toBe(false);

    await grantStepUp(session.session.token);

    expect(await isStepUpSatisfied(session)).toBe(true);
  });
});

describe("an unreachable Redis", () => {
  test("refuses rather than falling back to the session's age", async () => {
    // The only thing this guards is irreversible destruction of a customer's
    // data, so "cannot tell" has to read as "not proven". `cached()` and
    // `once()` next door swallow an outage and carry on; this must not.
    redisIsDown = true;

    expect(await isStepUpSatisfied(fresh("tok_outage"))).toBe(false);
  });
});
