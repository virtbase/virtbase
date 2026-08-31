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
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { count, eq } from "drizzle-orm";
import {
  proxmoxNodeGroups,
  serverPlanPrices,
  serverPlans,
  subscriptionRenewals,
  subscriptions,
  users,
} from "../../schema";
import type { TestDb } from "../../test-client";
import { createTestDb } from "../../test-client";

let testDb: TestDb;

const USER_ID = "usr_00000000000000000000000010";
const NODE_GROUP_ID = "png_renewal";
const PLAN_ID = "pck_renewal";
const PRICE_ID = "price_renewal";
const SUBSCRIPTION_A = "sub_renewal_a";
const SUBSCRIPTION_B = "sub_renewal_b";

/** The period two workers would both find due at the same instant. */
const PERIOD_START = new Date("2026-09-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-10-01T00:00:00.000Z");
/** The month after, which must remain claimable. */
const NEXT_PERIOD_START = PERIOD_END;
const NEXT_PERIOD_END = new Date("2026-11-01T00:00:00.000Z");

/** Enough racers that a lucky ordering cannot be mistaken for a working index. */
const CONCURRENT_CLAIMS = 10;

beforeAll(async () => {
  testDb = await createTestDb();
});

afterAll(async () => {
  await testDb.$client.close();
});

beforeEach(async () => {
  // Reverse foreign-key order, so every test starts from the same database.
  await testDb.delete(subscriptionRenewals);
  await testDb.delete(subscriptions);
  await testDb.delete(serverPlanPrices);
  await testDb.delete(serverPlans);
  await testDb.delete(proxmoxNodeGroups);
  await testDb.delete(users);

  await testDb.insert(users).values({
    id: USER_ID,
    name: "Renewal Test",
    email: "renewal@example.com",
    emailVerified: true,
  } as never);

  await testDb
    .insert(proxmoxNodeGroups)
    .values({ id: NODE_GROUP_ID, name: "Renewal Group" });

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

  // Two subscriptions, because the constraint has to separate them: they pay
  // for different servers, so the live-subject index tolerates both.
  await testDb.insert(subscriptions).values([
    {
      id: SUBSCRIPTION_A,
      userId: USER_ID,
      subjectId: "srv_a",
      serverPlanPriceId: PRICE_ID,
      currentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodEnd: PERIOD_START,
    },
    {
      id: SUBSCRIPTION_B,
      userId: USER_ID,
      subjectId: "srv_b",
      serverPlanPriceId: PRICE_ID,
      currentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodEnd: PERIOD_START,
    },
  ]);
});

/**
 * A claim on a period, exactly as the collector takes one.
 *
 * `async` rather than returning the query builder directly: a builder is a
 * thenable, not a promise, and `expect(...).rejects` silently declines to
 * inspect one.
 */
const claim = async (
  subscriptionId: string,
  periodStart: Date = PERIOD_START,
  periodEnd: Date = PERIOD_END,
) =>
  testDb
    .insert(subscriptionRenewals)
    .values({ subscriptionId, periodStart, periodEnd, amount: 500 })
    .returning({ id: subscriptionRenewals.id });

const renewalCount = async (subscriptionId: string) => {
  const [row] = await testDb
    .select({ n: count() })
    .from(subscriptionRenewals)
    .where(eq(subscriptionRenewals.subscriptionId, subscriptionId));

  return row?.n;
};

/**
 * The invariant the entire renewal system rests on, stated where it cannot be
 * forgotten.
 *
 * A customer must never be charged twice for one billing period. Nothing else
 * stands between them and that: there is no lock, no leader election and no
 * exactly-once queue. The INSERT into this table *is* the claim on a period,
 * and `subscription_renewals_subscription_id_period_start_unique` is the only
 * reason two workers that both find the same subscription due — the cron
 * overlapping itself, a manual retry racing the sweep, a webhook arriving
 * mid-run — cannot both go on to collect.
 *
 * Losing this index fails silently. Both charges succeed, both rows look
 * correct read on their own, and the first anyone hears of it is a chargeback,
 * its fee, a refund, and a customer who no longer trusts the bill. So these
 * run against a real Postgres engine and the real index: the property under
 * test is what the database does with two conflicting writes, which is exactly
 * the thing a mocked client cannot have an opinion about.
 */
describe("subscription_renewals - one claim per billing period", () => {
  test("rejects a second claim on a period already claimed", async () => {
    await claim(SUBSCRIPTION_A);

    await expect(claim(SUBSCRIPTION_A)).rejects.toThrow();

    expect(await renewalCount(SUBSCRIPTION_A)).toBe(1);
  });

  test("lets a different subscription claim the same period", async () => {
    // Every subscription on a monthly cycle comes due at the same instant, so
    // an over-broad constraint would renew one customer and strand the rest.
    await claim(SUBSCRIPTION_A);
    await claim(SUBSCRIPTION_B);

    expect(await renewalCount(SUBSCRIPTION_A)).toBe(1);
    expect(await renewalCount(SUBSCRIPTION_B)).toBe(1);
  });

  test("lets the same subscription claim the next period", async () => {
    // The ordinary case: a subscription is collected for month after month.
    // A constraint on `subscription_id` alone would allow exactly one renewal
    // ever and quietly end every subscription after its first month.
    await claim(SUBSCRIPTION_A);
    await claim(SUBSCRIPTION_A, NEXT_PERIOD_START, NEXT_PERIOD_END);

    expect(await renewalCount(SUBSCRIPTION_A)).toBe(2);
  });

  test("admits exactly one of ten simultaneous claims", async () => {
    // Two workers, same instant - the scenario the whole design exists for.
    // Not "mostly one": one. Nine losers must be nine errors, because any
    // caller that gets past this line goes on to charge a card.
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_CLAIMS }, () => claim(SUBSCRIPTION_A)),
    );

    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(CONCURRENT_CLAIMS - 1);

    // And the database agrees with the callers about who won.
    expect(await renewalCount(SUBSCRIPTION_A)).toBe(1);
  });

  test("hands the losers of an ON CONFLICT DO NOTHING race an empty result", async () => {
    // The production claim path uses `onConflictDoNothing`, so a loser must
    // learn it lost from an empty result rather than an exception. If it threw
    // here the collector would be writing a `try`/`catch` around every claim,
    // and the difference between "someone else has this period" and "the
    // database is broken" would come down to parsing an error string.
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_CLAIMS }, async () =>
        testDb
          .insert(subscriptionRenewals)
          .values({
            subscriptionId: SUBSCRIPTION_A,
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
            amount: 500,
          })
          .onConflictDoNothing()
          .returning({ id: subscriptionRenewals.id }),
      ),
    );

    // Nobody may throw. That is half the point of this path.
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);

    const rows = results.flatMap((r) =>
      r.status === "fulfilled" ? [r.value] : [],
    );

    const won = rows.filter((returned) => returned.length === 1);
    const lost = rows.filter((returned) => returned.length === 0);

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(CONCURRENT_CLAIMS - 1);
    // The winner gets the id it needs to go on and collect against.
    expect(typeof won[0]?.[0]?.id).toBe("string");

    expect(await renewalCount(SUBSCRIPTION_A)).toBe(1);
  });
});
