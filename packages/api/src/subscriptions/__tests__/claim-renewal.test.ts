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
import type { SubscriptionStatus } from "@virtbase/db/schema";
import {
  datacenters,
  orderItems,
  orders,
  orderTransitions,
  proxmoxNodeGroups,
  proxmoxNodes,
  serverPlanPrices,
  serverPlans,
  servers,
  subscriptionRenewals,
  subscriptions,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import {
  mockServer,
  mockServerPlan,
  mockServerPlanPrice,
  mockSession,
  seedServerGraph,
} from "../../testing/fixtures";

/**
 * As in `orders/__tests__/reconcile-orders.test.ts`: the module binds `db` at
 * import time, so the in-memory Postgres has to be mocked in before it loads.
 */
const testDb: TestDb = await createTestDb();

mock.module("@virtbase/db/client", () => ({ db: testDb }));

const { claimRenewal, createRenewalOrder } = await import("../claim-renewal");

const USER_ID = mockSession.user.id;
const SERVER_ID = mockServer.id;

/**
 * The period the customer has already paid for, which has run out.
 *
 * Fixed dates well in the past rather than offsets from `now`, so the assertions
 * below can name the exact instant a period should end. The pair is anchored on
 * the 31st and already clamped once (31 May to 30 Jun), which is what makes the
 * next period end on the 31st again rather than drifting to the 30th.
 */
const PERIOD_START = new Date("2020-05-31T09:00:00.000Z");
const PERIOD_END = new Date("2020-06-30T09:00:00.000Z");

/**
 * The consent every collectable subscription carries.
 *
 * `claimRenewal` refuses `auto_renew` with no mandate on file - a
 * merchant-initiated charge with no recorded agreement is one the provider
 * reverses on request - so a fixture without this is not a subscription the
 * collector will ever act on.
 */
const MANDATE_ACCEPTED_AT = new Date("2020-05-01T09:00:00.000Z");

const subscribe = async (
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
) => {
  const [row] = await testDb
    .insert(subscriptions)
    .values({
      userId: USER_ID,
      subjectId: SERVER_ID,
      serverPlanPriceId: mockServerPlanPrice.id,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      mandateAcceptedAt: MANDATE_ACCEPTED_AT,
      ...overrides,
    })
    .returning();

  if (!row) throw new Error("failed to seed subscription");
  return row;
};

const renewalsOf = (subscriptionId: string) =>
  testDb
    .select()
    .from(subscriptionRenewals)
    .where(eq(subscriptionRenewals.subscriptionId, subscriptionId));

beforeEach(async () => {
  // Reverse foreign-key order, so every test starts from the same database.
  await testDb.delete(subscriptionRenewals);
  await testDb.delete(subscriptions);
  await testDb.delete(orderTransitions);
  await testDb.delete(orderItems);
  await testDb.delete(orders);
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

describe("claiming a due period", () => {
  test("claims the period that starts where the paid-for one ends", async () => {
    const subscription = await subscribe();

    const renewal = await claimRenewal(subscription.id);

    expect(renewal).not.toBeNull();
    expect(renewal?.periodStart.toISOString()).toBe(PERIOD_END.toISOString());
    // 30 Jun + 1 month, anchored on the 31st the subscription really bills on
    // rather than on the clamped 30th, so July gets its 31 days.
    expect(renewal?.periodEnd.toISOString()).toBe("2020-07-31T09:00:00.000Z");
    expect(renewal?.status).toBe("pending");
    expect(renewal?.attempt).toBe(0);
    expect(renewal?.orderId).toBeNull();
  });

  test("freezes the server's locked renewal price onto the row", async () => {
    // The same number `checkout.ts` charges for a manual extension, from the
    // same price row, through the same resolver.
    const subscription = await subscribe();

    const renewal = await claimRenewal(subscription.id);

    expect(renewal?.amount).toBe(mockServerPlanPrice.renewalPrice);
    expect(renewal?.currency).toBe("EUR");
  });

  test("a later price change does not move an already claimed amount", async () => {
    const subscription = await subscribe();
    const renewal = await claimRenewal(subscription.id);

    await testDb
      .update(serverPlanPrices)
      .set({ renewalPrice: 9_999 })
      .where(eq(serverPlanPrices.id, mockServerPlanPrice.id));

    const [stored] = await renewalsOf(subscription.id);
    expect(stored?.amount).toBe(renewal?.amount);
    expect(stored?.amount).toBe(mockServerPlanPrice.renewalPrice);
  });

  test("claims a past_due subscription, because dunning is still climbing", async () => {
    const subscription = await subscribe({ status: "past_due" });

    expect(await claimRenewal(subscription.id)).not.toBeNull();
  });
});

describe("losing the race", () => {
  test("returns null when the period is already claimed", async () => {
    // The heart of it. Two workers find the same subscription due; the second
    // gets zero rows back from the insert and stops. This must never throw:
    // an overlapping cron is ordinary and must not page anyone.
    const subscription = await subscribe();

    const first = await claimRenewal(subscription.id);
    const second = await claimRenewal(subscription.id);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await renewalsOf(subscription.id)).toHaveLength(1);
  });

  test("two concurrent claims produce exactly one renewal", async () => {
    const subscription = await subscribe();

    const results = await Promise.all([
      claimRenewal(subscription.id),
      claimRenewal(subscription.id),
    ]);

    expect(results.filter((row) => row !== null)).toHaveLength(1);
    expect(await renewalsOf(subscription.id)).toHaveLength(1);
  });
});

describe("refusing to claim", () => {
  test("refuses a subscription with auto-renew switched off", async () => {
    const subscription = await subscribe({ autoRenew: false });

    expect(await claimRenewal(subscription.id)).toBeNull();
    expect(await renewalsOf(subscription.id)).toHaveLength(0);
  });

  test("refuses auto-renew with no mandate on file", async () => {
    // The invariant this guard exists for. `auto_renew` on with no
    // `mandate_accepted_at` is a merchant-initiated charge with no recorded
    // consent - the one the provider reverses on request, and the one the
    // mandate record exists specifically to defend. `subscriptions.setAutoRenew`
    // refuses to create the combination, but it is not the only writer of the
    // column, so the guarantee has to hold here, where money starts moving.
    const subscription = await subscribe({ mandateAcceptedAt: null });

    expect(subscription.autoRenew).toBe(true);
    expect(await claimRenewal(subscription.id)).toBeNull();
    expect(await renewalsOf(subscription.id)).toHaveLength(0);
  });

  test("refuses a period that has not run out yet", async () => {
    const subscription = await subscribe({
      currentPeriodStart: new Date(Date.now() - 1_000),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    expect(await claimRenewal(subscription.id)).toBeNull();
    expect(await renewalsOf(subscription.id)).toHaveLength(0);
  });

  test("refuses every status that must not be charged", async () => {
    for (const status of [
      "suspended",
      "cancelled",
      "ended",
    ] as SubscriptionStatus[]) {
      await testDb.delete(subscriptionRenewals);
      await testDb.delete(subscriptions);
      const subscription = await subscribe({ status });

      expect(await claimRenewal(subscription.id)).toBeNull();
      expect(await renewalsOf(subscription.id)).toHaveLength(0);
    }
  });

  test("refuses a subscription whose server no longer exists", async () => {
    // `subject_id` is deliberately not a foreign key, so this is a state the
    // schema allows. There is no honest price for a machine that is gone.
    const subscription = await subscribe();
    await testDb.delete(servers).where(eq(servers.id, SERVER_ID));

    expect(await claimRenewal(subscription.id)).toBeNull();
    expect(await renewalsOf(subscription.id)).toHaveLength(0);
  });

  test("throws for a subscription that does not exist", async () => {
    expect(claimRenewal("sub_missing")).rejects.toThrow("does not exist");
  });
});

describe("createRenewalOrder", () => {
  test("creates an extension order for the frozen amount and links it", async () => {
    const subscription = await subscribe();
    const renewal = await claimRenewal(subscription.id);
    if (!renewal) throw new Error("expected a claim");

    const orderId = await createRenewalOrder(renewal);

    const [order] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));

    expect(order?.type).toBe("extend_server");
    expect(order?.status).toBe("awaiting_payment");
    expect(order?.totalAmount).toBe(renewal.amount);
    expect(order?.serverId).toBe(SERVER_ID);
    expect(order?.configuration).toMatchObject({
      type: "extend_server",
      version: 2,
      server_id: SERVER_ID,
      server_plan_id: mockServerPlan.id,
      server_plan_price_id: mockServerPlanPrice.id,
    });

    const [linked] = await renewalsOf(subscription.id);
    expect(linked?.orderId).toBe(orderId);
  });

  test("charges the claimed amount even after the price moves", async () => {
    // A dunning sequence must ask for the same number in every email.
    const subscription = await subscribe();
    const renewal = await claimRenewal(subscription.id);
    if (!renewal) throw new Error("expected a claim");

    await testDb
      .update(serverPlanPrices)
      .set({ renewalPrice: 9_999 })
      .where(eq(serverPlanPrices.id, mockServerPlanPrice.id));

    const orderId = await createRenewalOrder(renewal);
    const [order] = await testDb
      .select({ totalAmount: orders.totalAmount })
      .from(orders)
      .where(eq(orders.id, orderId));

    expect(order?.totalAmount).toBe(mockServerPlanPrice.renewalPrice);
  });

  test("is idempotent: a renewal that already has an order keeps it", async () => {
    // The recovery path. A sweep re-running against a renewal whose order
    // creation was lost must never mint a second order for the same period.
    const subscription = await subscribe();
    const renewal = await claimRenewal(subscription.id);
    if (!renewal) throw new Error("expected a claim");

    const first = await createRenewalOrder(renewal);
    const second = await createRenewalOrder(renewal);

    expect(second).toBe(first);
    expect(await testDb.select().from(orders)).toHaveLength(1);
  });

  test("recovers a claim whose order creation was lost", async () => {
    // What a crash between the commit of the claim and the creation of the
    // order leaves behind: a `pending` renewal with no order. The invariant
    // that matters holds - nothing was charged - and the sweep finishes it.
    const subscription = await subscribe();
    const renewal = await claimRenewal(subscription.id);
    if (!renewal) throw new Error("expected a claim");

    const [stranded] = await renewalsOf(subscription.id);
    expect(stranded?.orderId).toBeNull();

    const orderId = await createRenewalOrder(stranded ?? renewal);

    const [recovered] = await renewalsOf(subscription.id);
    expect(recovered?.orderId).toBe(orderId);
  });
});
