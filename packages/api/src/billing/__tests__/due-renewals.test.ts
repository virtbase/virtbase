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
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { eq, sql } from "@virtbase/db";
import type { SubscriptionStatus } from "@virtbase/db/schema";
import {
  datacenters,
  orderItems,
  orders,
  orderTransitions,
  paymentEvents,
  paymentMethods,
  payments,
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
import type { ChargeOffSessionInput, OffSessionResult } from "@virtbase/ports";
import {
  mockServer,
  mockServerPlanPrice,
  mockSession,
  seedServerGraph,
} from "../../testing/fixtures";

const testDb: TestDb = await createTestDb();

mock.module("@virtbase/db/client", () => ({ db: testDb }));
mock.module("workflow/api", () => ({ start: async () => {} }));

const { integrations } = await import("../../integrations");
const { renewDueSubscriptions, retryDueRenewals } = await import(
  "../due-renewals"
);

const USER_ID = mockSession.user.id;

let charges: ChargeOffSessionInput[] = [];
let respond: () => Promise<OffSessionResult> = async () => ({
  status: "succeeded",
  externalId: `pi_${charges.length}`,
});

spyOn(integrations, "resolve").mockResolvedValue({
  method: "stripe",
  createPayment: async () => {
    throw new Error("not part of this surface");
  },
  retrievePayment: async () => {
    throw new Error("not part of this surface");
  },
  verifyWebhook: async () => null,
  chargeOffSession: async (input: ChargeOffSessionInput) => {
    charges.push(input);
    return respond();
  },
} as never);

/** A second, third, … server, so each subscription has its own subject. */
const seedServer = async (suffix: number) => {
  const id = `kvm_000000000000000000000000${suffix}`;

  await testDb
    .insert(servers)
    .values({ ...mockServer, id, vmid: 100 + suffix, name: `Server ${suffix}` })
    .onConflictDoNothing();

  return id;
};

/**
 * The consent every collectable subscription carries.
 *
 * `claimRenewal` refuses `auto_renew` with no mandate on file - a
 * merchant-initiated charge with no recorded agreement is one the provider
 * reverses on request - so a fixture without this is not a subscription the
 * collector will ever act on.
 */
const MANDATE_ACCEPTED_AT = new Date("2020-05-01T09:00:00.000Z");

const subscribe = async ({
  suffix,
  periodEnd,
  status = "active",
  autoRenew = true,
}: {
  suffix: number;
  periodEnd: Date;
  status?: SubscriptionStatus;
  autoRenew?: boolean;
}) => {
  const subjectId = await seedServer(suffix);

  const [row] = await testDb
    .insert(subscriptions)
    .values({
      userId: USER_ID,
      subjectId,
      serverPlanPriceId: mockServerPlanPrice.id,
      currentPeriodStart: new Date(periodEnd.getTime() - 30 * 86_400_000),
      currentPeriodEnd: periodEnd,
      status,
      autoRenew,
      mandateAcceptedAt: MANDATE_ACCEPTED_AT,
    })
    .returning();

  if (!row) throw new Error("failed to seed subscription");
  return row;
};

const DUE = new Date("2020-06-30T09:00:00.000Z");
const OLDER = new Date("2020-01-31T09:00:00.000Z");
const NOT_DUE = new Date("2999-01-01T09:00:00.000Z");

beforeEach(async () => {
  charges = [];
  respond = async () => ({
    status: "succeeded",
    externalId: `pi_${charges.length}`,
  });

  await testDb.delete(paymentEvents);
  await testDb.delete(payments);
  await testDb.delete(subscriptionRenewals);
  await testDb.delete(subscriptions);
  await testDb.delete(orderItems);
  await testDb.delete(orderTransitions);
  await testDb.delete(orders);
  await testDb.delete(paymentMethods);
  await testDb.delete(servers);
  await testDb.delete(serverPlanPrices);
  await testDb.delete(serverPlans);
  await testDb.delete(proxmoxNodeGroups);
  await testDb.delete(proxmoxNodes);
  await testDb.delete(datacenters);
  await testDb.delete(users);

  await seedServerGraph(testDb);
  await testDb.insert(paymentMethods).values({
    userId: USER_ID,
    provider: "stripe",
    externalId: "pm_stripe_default",
    type: "card",
    brand: "visa",
    last4: "4242",
    isDefault: true,
  });
});

afterAll(async () => {
  await testDb.$client.close();
});

describe("the due sweep", () => {
  test("collects only what the partial index describes", async () => {
    const due = await subscribe({ suffix: 1, periodEnd: DUE });
    await subscribe({ suffix: 2, periodEnd: NOT_DUE });
    await subscribe({ suffix: 3, periodEnd: DUE, autoRenew: false });
    await subscribe({ suffix: 4, periodEnd: DUE, status: "cancelled" });
    await subscribe({ suffix: 5, periodEnd: DUE, status: "suspended" });

    const result = await renewDueSubscriptions();

    // One subscription is due, renewing and in a status that may be charged.
    // A cancelled customer, one who switched renewal off, one whose term has
    // not run out and one already out of the collectable statuses are all
    // outside the index this sweep is written against.
    expect(result.examined).toBe(1);
    expect(result.collecting).toBe(1);
    expect(charges).toHaveLength(1);

    const [renewal] = await testDb.select().from(subscriptionRenewals);
    expect(renewal?.subscriptionId).toBe(due.id);
  });

  test("is bounded per run, oldest first", async () => {
    await subscribe({ suffix: 1, periodEnd: DUE });
    const oldest = await subscribe({ suffix: 2, periodEnd: OLDER });

    const result = await renewDueSubscriptions({ limit: 1 });

    expect(result.examined).toBe(1);
    // The customer who has been out of term longest is the one a truncated
    // batch must not keep starving.
    const [renewal] = await testDb.select().from(subscriptionRenewals);
    expect(renewal?.subscriptionId).toBe(oldest.id);
  });

  /**
   * A subscription that is being dunned never leaves the sweep's predicate:
   * `claimRenewal` writes the renewal row, but `current_period_end` does not
   * move until the extension is fulfilled and the subscription stays
   * `active`/`past_due` for the whole seven-day ladder. Those rows carry the
   * *oldest* `current_period_end` in the table, so an unfiltered
   * `ORDER BY current_period_end ASC LIMIT n` selects exactly them, every run,
   * for ever - and every one comes back `not_claimed` because the insert loses
   * its own conflict.
   */
  const stuckDunning = async (suffix: number, periodEnd: Date) => {
    const subscription = await subscribe({
      suffix,
      periodEnd,
      status: "past_due",
    });

    // Exactly what a declined first attempt leaves behind: the period claimed,
    // the ladder climbing, and the subscription still matching the sweep.
    await testDb.insert(subscriptionRenewals).values({
      subscriptionId: subscription.id,
      periodStart: periodEnd,
      periodEnd: new Date(periodEnd.getTime() + 30 * 86_400_000),
      amount: mockServerPlanPrice.renewalPrice,
      status: "pending",
      attempt: 2,
      failureCode: "insufficient_funds",
      nextAttemptAt: new Date(Date.now() + 86_400_000),
    });

    return subscription;
  };

  test("reaches a due subscription past more than a batch of stuck claims", async () => {
    // Seven of them, all older than the subscription that actually needs
    // collecting, against a batch that holds three.
    for (let suffix = 1; suffix <= 7; suffix++) {
      await stuckDunning(suffix, new Date(OLDER.getTime() + suffix * 60_000));
    }

    const due = await subscribe({ suffix: 8, periodEnd: DUE });

    const result = await renewDueSubscriptions({ limit: 3 });

    // [!] The whole fix in one assertion. Without the anti-join the batch is
    // three of the stuck rows, `claimRenewal` loses its own conflict on each,
    // and this reads `examined: 3, collecting: 0, skipped: 3` while the
    // customer below is never collected from again.
    expect(result.examined).toBe(1);
    expect(result.collecting).toBe(1);
    expect(result.skipped).toBe(0);
    expect(charges).toHaveLength(1);

    const claimed = await testDb
      .select()
      .from(subscriptionRenewals)
      .where(eq(subscriptionRenewals.subscriptionId, due.id));

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.periodStart).toEqual(DUE);
  });

  test("still skips a subscription whose period is claimed but settled", async () => {
    // The other half of the rule: the anti-join keys on the period being
    // claimed, not on the subscription, so a renewal for an *older* period
    // does not hide a subscription whose next one is genuinely due.
    const subscription = await subscribe({ suffix: 1, periodEnd: DUE });

    await testDb.insert(subscriptionRenewals).values({
      subscriptionId: subscription.id,
      periodStart: OLDER,
      periodEnd: DUE,
      amount: mockServerPlanPrice.renewalPrice,
      status: "succeeded",
      settledAt: OLDER,
    });

    const result = await renewDueSubscriptions();

    expect(result.examined).toBe(1);
    expect(result.collecting).toBe(1);
  });

  test("carries on when one subscription throws", async () => {
    await subscribe({ suffix: 1, periodEnd: OLDER });
    await subscribe({ suffix: 2, periodEnd: DUE });

    let first = true;
    respond = async () => {
      if (first) {
        first = false;
        throw new Error("the provider is having a bad minute");
      }
      return { status: "succeeded", externalId: "pi_second" };
    };

    const result = await renewDueSubscriptions();

    expect(result.examined).toBe(2);
    // A transport failure is rescheduled rather than counted as a failure of
    // the run, and the second subscription is still collected.
    expect(result.skipped).toBe(1);
    expect(result.collecting).toBe(1);
  });
});

describe("the retry sweep", () => {
  const declineOnce = async (suffix: number) => {
    const subscription = await subscribe({ suffix, periodEnd: DUE });
    respond = async () => ({
      status: "failed",
      externalId: `pi_declined_${suffix}`,
      code: "insufficient_funds",
      retryable: true,
      message: "no funds",
    });

    await renewDueSubscriptions();
    charges = [];
    respond = async () => ({ status: "succeeded", externalId: "pi_retry" });

    const [renewal] = await testDb
      .select()
      .from(subscriptionRenewals)
      .where(eq(subscriptionRenewals.subscriptionId, subscription.id));

    if (!renewal) throw new Error("expected a renewal");
    return renewal;
  };

  test("retries only what the ladder has scheduled", async () => {
    const renewal = await declineOnce(1);

    // Its rung is a day out.
    expect(await retryDueRenewals()).toMatchObject({ examined: 0 });
    expect(charges).toHaveLength(0);

    await testDb
      .update(subscriptionRenewals)
      .set({ nextAttemptAt: sql`now() - INTERVAL '1 minute'` })
      .where(eq(subscriptionRenewals.id, renewal.id));

    const result = await retryDueRenewals();

    expect(result.examined).toBe(1);
    expect(result.collecting).toBe(1);
    expect(charges).toHaveLength(1);
  });

  test("leaves a renewal the customer may still be authenticating", async () => {
    const renewal = await declineOnce(1);

    // `awaiting_action` carries a deadline in `next_attempt_at`, not a retry:
    // the intent is live and charging it again would be a second charge.
    await testDb
      .update(subscriptionRenewals)
      .set({
        status: "awaiting_action",
        nextAttemptAt: sql`now() - INTERVAL '1 minute'`,
      })
      .where(eq(subscriptionRenewals.id, renewal.id));

    const result = await retryDueRenewals();

    expect(result.examined).toBe(0);
    expect(charges).toHaveLength(0);
  });
});
