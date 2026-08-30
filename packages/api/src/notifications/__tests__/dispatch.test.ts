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
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { WritableStream as NativeWritableStream } from "node:stream/web";
import { eq } from "@virtbase/db";
import { notificationDeliveries, users } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";

/**
 * Puts back a global the root `bunfig.toml` preload replaces.
 *
 * `packages/test-utils/src/preload.ts` registers happy-dom, whose
 * `WritableStream` is a Node `Writable`. `@react-email/render` pipes React's
 * output into `new WritableStream(...)` and Bun's `ReadableStream.pipeTo`
 * refuses that object, so every email template throws before the provider is
 * ever reached - and this file would then be testing the wrong failure. The
 * preload documents itself as belonging in a package-local bunfig for exactly
 * this class of reason; this is a no-op once the root entry is gone.
 */
if (globalThis.WritableStream !== NativeWritableStream) {
  globalThis.WritableStream =
    NativeWritableStream as unknown as typeof WritableStream;
}

/**
 * The delivery pipeline end to end, over an in-memory Postgres and a stubbed
 * `fetch`.
 *
 * The point of going all the way through `@virtbase/email` and the real
 * Resend SDK rather than stubbing the channel is that the bug this guards
 * against was invisible at every seam above it: the SDK resolves
 * `{ data: null, error }` instead of throwing, `sendEmail` ignored that, the
 * channel returned a receipt anyway, and the delivery was written
 * `delivered`. Only the whole chain reproduces it. No request leaves the
 * process - `fetch` is replaced for the duration.
 */
const testDb: TestDb = await createTestDb();

mock.module("@virtbase/db/client", () => ({ db: testDb }));

const { integrations } = await import("../../integrations");
const { dispatchNotification } = await import("../dispatch");
const { retryFailedNotifications } = await import("../retry");
const { EmailNotificationChannel } = await import("../channels/email");
const { notificationTargetStore } = await import("../store");

const USER_ID = "usr_00000000000000000000000042";

const resolveAll = spyOn(integrations, "resolveAll");

/**
 * Operator destinations are configured rows rather than discovered channels,
 * and the store binds its database client when it is constructed - which
 * happens the first time anything imports `deliver.ts`, before this file can
 * point it at the in-memory Postgres. Stubbing the one call is enough: what
 * is under test is a dispatch that finds no destinations, and an empty list
 * is exactly that.
 */
const listTargets = notificationTargetStore
  ? spyOn(notificationTargetStore, "list").mockResolvedValue([])
  : null;

const OWNED_ENV = [
  "RESEND_API_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
] as const;

const savedEnv = new Map<string, string | undefined>();
const realFetch = globalThis.fetch;

/** Avoids the `delete` operator, which the lint configuration forbids. */
const unset = (key: string): void => {
  Reflect.deleteProperty(process.env, key);
};

let respond: () => Response = () => new Response("{}", { status: 200 });

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const notice = {
  key: "abuse.case.notice",
  audience: { kind: "user", userId: USER_ID } as const,
  severity: "critical" as const,
  params: {
    reference: "AB-1042",
    category: "network_abuse",
    deadlineHours: 24,
  },
  url: "/abuse/abus_1",
};

const deliveries = async () =>
  await testDb
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.userId, USER_ID));

beforeEach(async () => {
  await testDb.delete(notificationDeliveries);
  await testDb.delete(users);
  await testDb.insert(users).values({
    id: USER_ID,
    name: "Walter White",
    email: "walter@example.com",
    locale: "en",
  });

  for (const key of OWNED_ENV) savedEnv.set(key, process.env[key]);
  for (const key of OWNED_ENV) unset(key);
  process.env.RESEND_API_KEY = "re_not_a_real_credential";

  respond = () => json(200, { id: "email_1" });
  globalThis.fetch = (async () => respond()) as unknown as typeof fetch;

  resolveAll.mockResolvedValue([new EmailNotificationChannel()]);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of savedEnv) {
    if (undefined === value) unset(key);
    else process.env[key] = value;
  }
  savedEnv.clear();
});

afterAll(async () => {
  resolveAll.mockRestore();
  listTargets?.mockRestore();
  await testDb.$client.close();
});

describe("the email channel and the delivery log", () => {
  test("a message the provider refuses is recorded as failed", async () => {
    // MAIL-1, in the shape that matters. Resend answers an unverified sending
    // domain with a 403 and resolves; nothing above threw; the row said
    // `delivered`. The abuse desk starts a 24-hour response clock off that
    // row and escalates - throttle, isolate, power off - on the customer's
    // silence, so a lie here ends with a paying customer's servers off.
    respond = () =>
      json(403, {
        name: "validation_error",
        message: "The virtbase.com domain is not verified.",
      });

    const result = await dispatchNotification(notice);

    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.delivered).toBe(0);

    const [row] = await deliveries();
    expect(row?.status).toBe("failed");
    expect(row?.channel).toBe("email");
    expect(row?.attempts).toBe(1);
    expect(row?.error).toMatch(/domain is not verified/);
    expect(row?.deliveredAt).toBeNull();
  });

  test("and is left for the retry sweep, which can still deliver it", async () => {
    // The whole point of failing loudly: the backoff and
    // `/api/cron/retry-notifications` already existed and email never reached
    // them.
    respond = () =>
      json(429, { name: "rate_limit_exceeded", message: "Too many requests." });

    await dispatchNotification(notice);

    const [failed] = await deliveries();
    expect(failed?.nextAttemptAt).not.toBeNull();

    // The backoff puts the next attempt five minutes out; the sweep is what
    // is being tested, not the clock.
    await testDb
      .update(notificationDeliveries)
      .set({ nextAttemptAt: new Date(Date.now() - 60_000) })
      .where(eq(notificationDeliveries.userId, USER_ID));

    respond = () => json(200, { id: "email_2" });
    const swept = await retryFailedNotifications();

    expect(swept.attempted).toBe(1);
    expect(swept.delivered).toBe(1);

    const [row] = await deliveries();
    expect(row?.status).toBe("delivered");
    expect(row?.attempts).toBe(2);
    expect(row?.error).toBeNull();
  });

  test("no configured provider fails the delivery rather than logging it", async () => {
    // The other half of MAIL-1: a deployment with no mail credentials used to
    // record every notification as delivered without a single request being
    // made.
    unset("RESEND_API_KEY");

    const result = await dispatchNotification(notice);

    expect(result.failed).toBe(1);

    const [row] = await deliveries();
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatch(/No email provider is configured/);
  });

  test("an accepted message is recorded as delivered", async () => {
    const result = await dispatchNotification(notice);

    expect(result.delivered).toBe(1);

    const [row] = await deliveries();
    expect(row?.status).toBe("delivered");
    expect(row?.deliveredAt).not.toBeNull();
    expect(row?.error).toBeNull();
  });
});

describe("a notification with no channel to send it on", () => {
  test("still leaves a row saying so", async () => {
    // NOT-02. Returning early wrote nothing at all, and the abuse desk then
    // put the customer on a response clock they were provably never told
    // about. The evidence trail has to exist even when - especially when -
    // nothing was sent.
    resolveAll.mockResolvedValue([]);

    const result = await dispatchNotification(notice);

    expect(result).toEqual({
      created: 1,
      deduplicated: 0,
      delivered: 0,
      skipped: 1,
      failed: 0,
    });

    const [row] = await deliveries();
    expect(row?.status).toBe("skipped");
    expect(row?.channel).toBe("none");
    expect(row?.notificationKey).toBe("abuse.case.notice");
    expect(row?.error).toMatch(/No enabled integration provides/);
    expect(row?.url).toBe("/abuse/abus_1");
  });

  test("says so once per group, not once per dispatch", async () => {
    resolveAll.mockResolvedValue([]);

    await dispatchNotification({ ...notice, groupKey: "abuse:abus_1" });
    const again = await dispatchNotification({
      ...notice,
      groupKey: "abuse:abus_1",
    });

    expect(again.deduplicated).toBe(1);
    expect(again.created).toBe(0);
    expect(await deliveries()).toHaveLength(1);
  });

  test("the row is terminal, so the retry sweep leaves it alone", async () => {
    // Stated rather than assumed: `skipped` has no `next_attempt_at` and the
    // sweep selects `failed`. Making "nobody could be reached" recoverable
    // would mean re-resolving candidates on the retry path, which is a change
    // to the retry design rather than a use of it.
    resolveAll.mockResolvedValue([]);

    await dispatchNotification(notice);

    const [row] = await deliveries();
    expect(row?.nextAttemptAt).toBeNull();
    expect((await retryFailedNotifications()).attempted).toBe(0);
  });

  test("an operator notification nothing subscribes to is recorded too", async () => {
    resolveAll.mockResolvedValue([]);

    const result = await dispatchNotification({
      key: "abuse.case.escalated",
      audience: { kind: "operator" },
      severity: "warning",
      params: { reference: "AB-1042", level: "isolate", reason: "no answer" },
    });

    expect(result.skipped).toBe(1);

    const [row] = await testDb.select().from(notificationDeliveries);
    expect(row?.audience).toBe("operator");
    expect(row?.status).toBe("skipped");
    expect(row?.error).toMatch(/No enabled operator target accepts/);
  });
});
