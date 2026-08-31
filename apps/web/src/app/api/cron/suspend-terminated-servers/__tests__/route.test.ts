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
import { mockServer, seedServerGraph } from "@virtbase/api/testing/fixtures";
import { eq } from "@virtbase/db";
import { servers, subscriptions } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { RENEWAL_SUSPENSION_GRACE_DAYS } from "@virtbase/utils";
import type { NextRequest } from "next/server";

const testDb: TestDb = await createTestDb();

mock.module("@sentry/nextjs", () => ({ captureException: () => {} }));
mock.module("@virtbase/db/client", () => ({ db: testDb }));
// The route's own authentication is exercised by `withCronSecret`; here it
// would only mean building an env just to hand the handler a header back.
mock.module("@/lib/with-cron-secret", () => ({
  withCronSecret: (handler: (request: NextRequest) => Promise<Response>) =>
    handler,
}));
/** Only the two calls the route makes: `onboot: false`, then a bulk shutdown. */
mock.module("@virtbase/api/proxmox", () => ({
  getProxmoxInstance: () => ({
    node: { qemu: { $: () => ({ config: { $put: async () => {} } }) } },
    cluster: {
      "bulk-action": { guest: { shutdown: { $post: async () => {} } } },
    },
  }),
}));
mock.module("@virtbase/email", () => ({
  sendBatchEmail: async () => {},
}));

const { GET } = await import("../route");

const SERVER_ID = mockServer.id;

const run = async () => {
  const response = await GET(new Request("https://x/") as NextRequest);
  expect(response.status).toBe(200);
};

const subscribe = async (
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
) => {
  const [row] = await testDb
    .insert(subscriptions)
    .values({
      userId: mockServer.userId,
      subjectId: SERVER_ID,
      serverPlanPriceId: mockServer.serverPlanPriceId,
      currentPeriodStart: new Date("2026-01-15T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-02-15T00:00:00.000Z"),
      ...overrides,
    })
    .returning();

  if (!row) throw new Error("failed to seed subscription");
  return row;
};

const readSubscription = (id: string) =>
  testDb
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .then(([row]) => row);

beforeEach(async () => {
  await testDb.delete(subscriptions);
  await seedServerGraph(testDb);
  // Out of term, and not yet swept.
  await testDb
    .update(servers)
    .set({ terminatesAt: new Date(Date.now() - 60_000), suspendedAt: null })
    .where(eq(servers.id, SERVER_ID));
});

describe("suspend-terminated-servers", () => {
  test("a suspended server's subscription is suspended, not ended", async () => {
    // [!] Suspension is recoverable. The customer has the deletion grace
    // period to pay and get the machine back, so the subscription has to be
    // left somewhere money can still fix - `ended` is terminal for every route
    // in, and closing it here would take that away.
    // `autoRenew: false` because an auto-renewing subscription is now
    // deliberately exempt from this sweep - see the block below.
    const subscription = await subscribe({ autoRenew: false });

    await run();

    const after = await readSubscription(subscription.id);
    expect(after?.status).toBe("suspended");
    expect(after?.endedAt).toBeNull();
    expect(after?.cancelReason).toBeNull();
  });

  test("a server with no subscription is suspended all the same", async () => {
    await run();

    const [server] = await testDb
      .select({ suspendedAt: servers.suspendedAt })
      .from(servers)
      .where(eq(servers.id, SERVER_ID));

    expect(server?.suspendedAt).not.toBeNull();
    expect(await testDb.$count(subscriptions)).toBe(0);
  });

  test("a second pass over the same rows changes nothing", async () => {
    // Crons re-run. `suspended -> suspended` is not a legal transition, and
    // the idempotent flag is what makes that a quiet no-op rather than a
    // failed run.
    const subscription = await subscribe({ status: "suspended" });

    await run();

    expect((await readSubscription(subscription.id))?.status).toBe("suspended");
  });

  test("a server still in term is left alone", async () => {
    const subscription = await subscribe({ autoRenew: false });
    await testDb
      .update(servers)
      .set({ terminatesAt: new Date(Date.now() + 86_400_000) })
      .where(eq(servers.id, SERVER_ID));

    await run();

    expect((await readSubscription(subscription.id))?.status).toBe("active");
  });
});

/**
 * The race that would have made automatic renewal never fire.
 *
 * `subscriptions.current_period_end` is written equal to `servers.terminates_at`,
 * so a term ending makes this sweep and the renewal sweep due in the same
 * instant. This one runs every fifteen minutes, renewal hourly - so without an
 * exemption the suspension wins nearly every time, and because it moves the
 * subscription to `suspended`, which no claim accepts, the renewal is never
 * attempted at all. The customer would lose the server with a working card on
 * file, and nothing would ever retry.
 */
describe("suspend-terminated-servers - renewal's grace window", () => {
  test("a server whose renewal has not been tried yet keeps running", async () => {
    const subscription = await subscribe({ autoRenew: true, status: "active" });

    await run();

    const [server] = await testDb
      .select({ suspendedAt: servers.suspendedAt })
      .from(servers)
      .where(eq(servers.id, SERVER_ID));

    expect(server?.suspendedAt).toBeNull();
    expect((await readSubscription(subscription.id))?.status).toBe("active");
  });

  test("a server part-way through dunning keeps running", async () => {
    await subscribe({ autoRenew: true, status: "past_due" });

    await run();

    const [server] = await testDb
      .select({ suspendedAt: servers.suspendedAt })
      .from(servers)
      .where(eq(servers.id, SERVER_ID));

    expect(server?.suspendedAt).toBeNull();
  });

  test("once dunning gives up, the very next run powers it off", async () => {
    // Exhaustion moves the subscription to `suspended`, which stops matching
    // the exemption. Nothing else has to happen for the machine to go off -
    // which is why the renewal worker deliberately powers nothing off itself.
    await subscribe({ autoRenew: true, status: "suspended" });

    await run();

    const [server] = await testDb
      .select({ suspendedAt: servers.suspendedAt })
      .from(servers)
      .where(eq(servers.id, SERVER_ID));

    expect(server?.suspendedAt).not.toBeNull();
  });

  test("the window is bounded, so a stalled renewal cannot give service away", async () => {
    await subscribe({ autoRenew: true, status: "past_due" });
    await testDb
      .update(servers)
      .set({
        terminatesAt: new Date(
          Date.now() - (RENEWAL_SUSPENSION_GRACE_DAYS + 1) * 86_400_000,
        ),
      })
      .where(eq(servers.id, SERVER_ID));

    await run();

    const [server] = await testDb
      .select({ suspendedAt: servers.suspendedAt })
      .from(servers)
      .where(eq(servers.id, SERVER_ID));

    expect(server?.suspendedAt).not.toBeNull();
  });

  test("renewal switched off suspends at term end exactly as it always did", async () => {
    await subscribe({ autoRenew: false, status: "active" });

    await run();

    const [server] = await testDb
      .select({ suspendedAt: servers.suspendedAt })
      .from(servers)
      .where(eq(servers.id, SERVER_ID));

    expect(server?.suspendedAt).not.toBeNull();
  });
});
