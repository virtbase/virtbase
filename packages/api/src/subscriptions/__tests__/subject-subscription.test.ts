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
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";

/** The module binds `db` at import time; mock it in before it loads. */
const testDb: TestDb = await createTestDb();

mock.module("@virtbase/db/client", () => ({ db: testDb }));

const { transitionSubjectSubscription } = await import(
  "../subject-subscription"
);

const USER_ID = "usr_00000000000000000000000031";
const NODE_GROUP_ID = "png_subject";
const PLAN_ID = "pck_subject";
const PRICE_ID = "price_subject";
const SERVER_ID = "kvm_subject";

const subscribe = async (
  overrides: Partial<typeof schema.subscriptions.$inferInsert> = {},
) => {
  const [row] = await testDb
    .insert(schema.subscriptions)
    .values({
      userId: USER_ID,
      subjectId: SERVER_ID,
      serverPlanPriceId: PRICE_ID,
      currentPeriodStart: new Date("2026-01-15T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-02-15T00:00:00.000Z"),
      ...overrides,
    })
    .returning();

  if (!row) throw new Error("failed to seed subscription");
  return row;
};

const read = (id: string) =>
  testDb
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, id))
    .then(([row]) => row);

beforeEach(async () => {
  await testDb.delete(schema.subscriptionRenewals);
  await testDb.delete(schema.subscriptions);
  await testDb.delete(schema.serverPlanPrices);
  await testDb.delete(schema.serverPlans);
  await testDb.delete(schema.proxmoxNodeGroups);
  await testDb.delete(schema.users);

  await testDb.insert(schema.users).values({
    id: USER_ID,
    name: "Subject Test",
    email: "subject@example.com",
    emailVerified: true,
  } as never);

  await testDb
    .insert(schema.proxmoxNodeGroups)
    .values({ id: NODE_GROUP_ID, name: "Subject Group" });

  await testDb.insert(schema.serverPlans).values({
    id: PLAN_ID,
    proxmoxNodeGroupId: NODE_GROUP_ID,
    name: "VPS Small",
    cores: 1,
    memory: 1_024,
    storage: 20,
    netrate: 1_000,
    price: 500,
  });

  await testDb.insert(schema.serverPlanPrices).values({
    id: PRICE_ID,
    serverPlanId: PLAN_ID,
    purchasePrice: 500,
    renewalPrice: 500,
  });
});

afterAll(async () => {
  await testDb.$client.close();
});

describe("transitionSubjectSubscription", () => {
  test("a suspended server's subscription suspends rather than ends", async () => {
    // [!] Suspension is recoverable and `ended` is terminal for every route
    // in. The customer has the deletion grace period to pay and get the
    // machine back, and `suspended` is the one non-terminal state money can
    // still fix - ending here would close a subscription they may be about to
    // rescue.
    const subscription = await subscribe({ status: "past_due" });

    const result = await transitionSubjectSubscription(SERVER_ID, "suspended", {
      reason: "term_elapsed",
    });

    expect(result?.changed).toBe(true);
    const after = await read(subscription.id);
    expect(after?.status).toBe("suspended");
    expect(after?.endedAt).toBeNull();
  });

  test("a re-run of the sweep is a quiet no-op", async () => {
    // Both callers are crons that pass over the same rows again. The state
    // machine refuses `suspended -> suspended`, and `idempotent` is what turns
    // that refusal into the no-op it should be rather than a failed cron run.
    await subscribe({ status: "suspended" });

    const result = await transitionSubjectSubscription(SERVER_ID, "suspended");

    expect(result?.changed).toBe(false);
    expect(result?.status).toBe("suspended");
  });

  test("a subject with no subscription answers null", async () => {
    // The common case, and never a fault: nothing backfills subscriptions, so
    // every server sold before the table existed has none.
    expect(await transitionSubjectSubscription(SERVER_ID, "ended")).toBeNull();
  });

  test("an already ended subscription is not matched at all", async () => {
    // `status <> 'ended'` matches the partial unique index, so a subject that
    // has been let go can be picked up again later rather than being poisoned
    // by its own history - and a second cron pass finds nothing to do.
    const ended = await subscribe({
      status: "ended",
      cancelReason: "customer",
    });

    expect(await transitionSubjectSubscription(SERVER_ID, "ended")).toBeNull();
    // And the original reason survives; nothing overwrites it.
    expect((await read(ended.id))?.cancelReason).toBe("customer");
  });

  test("ending records why", async () => {
    const subscription = await subscribe({ status: "suspended" });

    await transitionSubjectSubscription(SERVER_ID, "ended", {
      reason: "grace_period_elapsed",
    });

    const after = await read(subscription.id);
    expect(after?.status).toBe("ended");
    expect(after?.cancelReason).toBe("grace_period_elapsed");
  });

  test("a suspended subject is only ever the one asked for", async () => {
    // `subject_id` is not a foreign key, so the predicate is the only thing
    // keeping one server's suspension off another server's subscription.
    const mine = await subscribe();
    const theirs = await subscribe({ subjectId: "kvm_somebody_else" });

    await transitionSubjectSubscription(SERVER_ID, "suspended");

    expect((await read(mine.id))?.status).toBe("suspended");
    expect((await read(theirs.id))?.status).toBe("active");
  });
});
