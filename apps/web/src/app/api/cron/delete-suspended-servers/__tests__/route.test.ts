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
import { seedServerGraph } from "@virtbase/api/testing/fixtures";
import { eq } from "@virtbase/db";
import { servers } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import type { NextRequest } from "next/server";

const testDb: TestDb = await createTestDb();

/** Every deletion the route asked for, in the order it asked. */
const started: { serverId: string }[] = [];

mock.module("@virtbase/db/client", () => ({ db: testDb }));
// The route's own authentication is exercised by `withCronSecret`; here it
// would only mean building an env just to hand the handler a header back.
mock.module("@/lib/with-cron-secret", () => ({
  withCronSecret: (handler: (request: NextRequest) => Promise<Response>) =>
    handler,
}));
mock.module("@virtbase/api/workflows", () => ({
  deleteServerWorkflow: () => {},
}));
mock.module("workflow/api", () => ({
  start: async (_workflow: unknown, args: [{ serverId: string }]) => {
    // biome-ignore lint/style/noNonNullAssertion: the route always passes one
    started.push(args[0]!);
  },
}));

const { GET } = await import("../route");

const SERVER_ID = "kvm_0000000000000000000000000";
const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

beforeEach(async () => {
  started.length = 0;
  await seedServerGraph(testDb);
});

/** The ids the route queued for deletion. */
const run = async () => {
  const response = await GET(new Request("https://x/") as NextRequest);
  expect(response.status).toBe(200);
  return started.map(({ serverId }) => serverId);
};

describe("delete-suspended-servers", () => {
  test("deletes a server that has been suspended past the grace period", async () => {
    await testDb
      .update(servers)
      .set({ suspendedAt: days(-10), terminatesAt: days(-10) })
      .where(eq(servers.id, SERVER_ID));

    expect(await run()).toEqual([SERVER_ID]);
  });

  test("leaves a renewed server alone however old its suspension is", async () => {
    // The race this guard exists for: the extend workflow clears `suspendedAt`
    // and pushes `terminatesAt` out, and the suspend cron's trailing update
    // stamps `suspendedAt` back on afterwards. The customer has paid and the
    // term is live, so the deletion clock must not apply.
    await testDb
      .update(servers)
      .set({ suspendedAt: days(-10), terminatesAt: days(20) })
      .where(eq(servers.id, SERVER_ID));

    expect(await run()).toEqual([]);
  });

  test("leaves a server whose grace period has not elapsed", async () => {
    await testDb
      .update(servers)
      .set({ suspendedAt: days(-1), terminatesAt: days(-1) })
      .where(eq(servers.id, SERVER_ID));

    expect(await run()).toEqual([]);
  });

  test("leaves a suspended server that carries no term at all", async () => {
    // Nothing writes this combination today, so it can only be damage — and
    // deleting on the strength of damaged data is exactly the failure mode.
    await testDb
      .update(servers)
      .set({ suspendedAt: days(-10), terminatesAt: null })
      .where(eq(servers.id, SERVER_ID));

    expect(await run()).toEqual([]);
  });
});
