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
  proxmoxNodeGroups,
  serverPlanPrices,
  serverPlans,
  subscriptionRenewals,
  subscriptions,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";

/** The module binds `db` at import time; mock it in before it loads. */
const testDb: TestDb = await createTestDb();

mock.module("@virtbase/db/client", () => ({ db: testDb }));

const { transitionSubscription } = await import("../transition-subscription");
const { IllegalSubscriptionTransitionError } = await import(
  "../../lib/subscription-status"
);

const USER_ID = "usr_00000000000000000000000021";
const NODE_GROUP_ID = "png_transition";
const PLAN_ID = "pck_transition";
const PRICE_ID = "price_transition";
const SERVER_ID = "srv_transition";

const subscribe = async (
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
) => {
  const [row] = await testDb
    .insert(subscriptions)
    .values({
      userId: USER_ID,
      subjectId: SERVER_ID,
      serverPlanPriceId: PRICE_ID,
      currentPeriodStart: new Date("2026-01-31T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-02-28T00:00:00.000Z"),
      ...overrides,
    })
    .returning();

  if (!row) throw new Error("failed to seed subscription");
  return row;
};

const read = (id: string) =>
  testDb
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .then(([row]) => row);

beforeEach(async () => {
  await testDb.delete(subscriptionRenewals);
  await testDb.delete(subscriptions);
  await testDb.delete(serverPlanPrices);
  await testDb.delete(serverPlans);
  await testDb.delete(proxmoxNodeGroups);
  await testDb.delete(users);

  await testDb.insert(users).values({
    id: USER_ID,
    name: "Transition Test",
    email: "transition@example.com",
    emailVerified: true,
  } as never);

  await testDb
    .insert(proxmoxNodeGroups)
    .values({ id: NODE_GROUP_ID, name: "Transition Group" });

  await testDb.insert(serverPlans).values({
    id: PLAN_ID,
    proxmoxNodeGroupId: NODE_GROUP_ID,
    name: "VPS Small",
    cores: 1,
    memory: 1_024,
    storage: 20,
    price: 500,
  });

  await testDb.insert(serverPlanPrices).values({
    id: PRICE_ID,
    serverPlanId: PLAN_ID,
    purchasePrice: 500,
    renewalPrice: 500,
  });
});

afterAll(async () => {
  await testDb.$client.close();
});

describe("moving a subscription", () => {
  test("records the new status", async () => {
    const subscription = await subscribe();

    const result = await transitionSubscription(subscription.id, "past_due", {
      actor: "system:collect-renewals",
      reason: "card_declined",
    });

    expect(result).toEqual({ status: "past_due", changed: true });
    expect((await read(subscription.id))?.status).toBe("past_due");
  });

  test("a second decline is a legal no-change, not an error", async () => {
    const subscription = await subscribe({ status: "past_due" });

    const result = await transitionSubscription(subscription.id, "past_due");

    // Legal, so it is reported as a change even though the status is the
    // same - the machine, not sameness, decides.
    expect(result.status).toBe("past_due");
    expect(result.changed).toBe(true);
  });

  test("stamps cancelledAt and the reason when cancelling", async () => {
    const subscription = await subscribe();
    expect(subscription.cancelledAt).toBeNull();

    await transitionSubscription(subscription.id, "cancelled", {
      actor: `customer:${USER_ID}`,
      reason: "customer",
    });

    const after = await read(subscription.id);
    expect(after?.status).toBe("cancelled");
    expect(after?.cancelledAt).toBeInstanceOf(Date);
    expect(after?.cancelReason).toBe("customer");
    // Cancelling is not ending: the customer keeps what they paid for.
    expect(after?.endedAt).toBeNull();
  });

  test("stamps endedAt when ending", async () => {
    const subscription = await subscribe();

    await transitionSubscription(subscription.id, "ended", {
      reason: "subject_deleted",
    });

    const after = await read(subscription.id);
    expect(after?.status).toBe("ended");
    expect(after?.endedAt).toBeInstanceOf(Date);
    expect(after?.cancelReason).toBe("subject_deleted");
  });

  test("ending does not overwrite why the customer cancelled", async () => {
    // The only answer anyone will want later is who stopped it and why, not
    // that the period subsequently elapsed.
    const subscription = await subscribe();
    await transitionSubscription(subscription.id, "cancelled", {
      reason: "customer",
    });
    await transitionSubscription(subscription.id, "ended", {
      reason: "period_elapsed",
    });

    expect((await read(subscription.id))?.cancelReason).toBe("customer");
  });

  test("resuming clears the cancellation", async () => {
    // Left set, `cancelled_at` makes a live subscription render as "ends on
    // the 3rd" forever.
    const subscription = await subscribe();
    await transitionSubscription(subscription.id, "cancelled", {
      reason: "customer",
    });

    const result = await transitionSubscription(subscription.id, "active", {
      actor: `customer:${USER_ID}`,
    });

    expect(result).toEqual({ status: "active", changed: true });
    const after = await read(subscription.id);
    expect(after?.cancelledAt).toBeNull();
    expect(after?.cancelReason).toBeNull();
  });
});

describe("refusing to move", () => {
  test("throws on an illegal transition", async () => {
    const subscription = await subscribe({ status: "ended" });

    expect(
      transitionSubscription(subscription.id, "active"),
    ).rejects.toBeInstanceOf(IllegalSubscriptionTransitionError);
  });

  test("an illegal transition changes nothing", async () => {
    const subscription = await subscribe({ status: "ended" });

    await transitionSubscription(subscription.id, "past_due").catch(() => {});

    expect((await read(subscription.id))?.status).toBe("ended");
  });

  test("idempotent turns an illegal transition into a no-op", async () => {
    // A provider redelivering an old event must not be answered with a throw,
    // or it retries the delivery forever.
    const subscription = await subscribe({ status: "ended" });

    const result = await transitionSubscription(subscription.id, "active", {
      idempotent: true,
    });

    expect(result).toEqual({ status: "ended", changed: false });
  });

  test("a guard that says no reports changed: false rather than throwing", async () => {
    // Optimistic concurrency for a sweep that read its batch a minute ago.
    // Suspending on a stale read powers off a server whose customer has paid.
    const subscription = await subscribe();

    const result = await transitionSubscription(subscription.id, "suspended", {
      guard: (current) => current.updatedAt.getTime() === 0,
    });

    expect(result).toEqual({ status: "active", changed: false });
    expect((await read(subscription.id))?.status).toBe("active");
  });

  test("a guard that says yes lets the transition through", async () => {
    const subscription = await subscribe();

    const result = await transitionSubscription(subscription.id, "suspended", {
      guard: (current) =>
        current.status === "active" &&
        current.updatedAt.getTime() === subscription.updatedAt.getTime(),
    });

    expect(result).toEqual({ status: "suspended", changed: true });
  });

  test("throws for a subscription that does not exist", async () => {
    expect(transitionSubscription("sub_missing", "cancelled")).rejects.toThrow(
      "does not exist",
    );
  });
});
