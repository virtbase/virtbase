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

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "@virtbase/db";
import {
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
  serverPlanPrices,
  serverPlans,
  servers,
  subscriptions,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import {
  mockServer,
  mockServerPlanPrice,
  mockSession,
  seedServerGraph,
} from "../../testing/fixtures";

const testDb: TestDb = await createTestDb();

mock.module("@virtbase/db/client", () => ({ db: testDb }));

// The mocked client, so the helper below is handed the same `Executor` the
// production code passes it rather than a PGlite handle the types refuse.
const { db } = await import("@virtbase/db/client");
const { createSubscription } = await import("../create-subscription");
const { findLiveSubscription } = await import("../subject-subscription");

const USER_ID = mockSession.user.id;
const SERVER_ID = mockServer.id;
const PERIOD_START = new Date("2020-05-31T09:00:00.000Z");

const create = () =>
  createSubscription({
    userId: USER_ID,
    subjectId: SERVER_ID,
    serverPlanPriceId: mockServerPlanPrice.id,
    currentPeriodStart: PERIOD_START,
  });

beforeEach(async () => {
  await testDb.delete(subscriptions);
  await testDb.delete(servers);
  await testDb.delete(serverPlanPrices);
  await testDb.delete(serverPlans);
  await testDb.delete(proxmoxNodes);
  await testDb.delete(proxmoxNodeGroups);
  await testDb.delete(datacenters);
  await testDb.delete(users);

  await seedServerGraph(testDb);
});

afterAll(async () => {
  await testDb.$client.close();
});

describe("createSubscription", () => {
  test("stores the subject the way the live-subject index reads it", async () => {
    const created = await create();

    expect(created.subjectType).toBe("server");
    expect(created.subjectId).toBe(SERVER_ID);
    // The same order the exported helper takes its arguments in. This is the
    // pairing `subscriptions_subject_live_index` is unique on, and getting it
    // backwards anywhere is what opens a second subscription against a server
    // that already has one - two charges a month, each unaware of the other.
    await expect(
      findLiveSubscription(db, SERVER_ID, "server"),
    ).resolves.toMatchObject({ id: created.id });
  });

  test("a replayed call adopts the existing row rather than opening a second", async () => {
    // Provisioning is a durable workflow, so every caller is an at-least-once
    // caller. The pre-read has to find the row it wrote the first time; a
    // lookup with the two subject arguments the wrong way round matches
    // nothing, falls through to the insert and takes the unique violation.
    const first = await create();
    const second = await create();

    expect(second.id).toBe(first.id);
    expect(await testDb.select().from(subscriptions)).toHaveLength(1);
  });

  test("a subject whose subscription has ended can be subscribed again", async () => {
    const first = await create();

    await testDb
      .update(subscriptions)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(subscriptions.id, first.id));

    const second = await create();

    expect(second.id).not.toBe(first.id);
    expect(await testDb.select().from(subscriptions)).toHaveLength(2);
  });

  test("cannot charge anybody until a mandate is recorded against it", async () => {
    // The default the provisioning workflow relies on: a row that exists so
    // the term has somewhere to live, and that `claimRenewal` will not act on.
    const created = await create();

    expect(created.mandateAcceptedAt).toBeNull();
    expect(created.mandateTextVersion).toBeNull();
  });
});
