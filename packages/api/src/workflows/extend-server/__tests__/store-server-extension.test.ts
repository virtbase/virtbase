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
  mock,
  test,
} from "bun:test";
import { and, eq, lte, sql } from "@virtbase/db";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { billingAnchorDay, nextPeriodEnd } from "../../../subscriptions/period";
import {
  mockServer,
  mockServerPlanPrice,
  mockSession,
  seedServerGraph,
} from "../../../testing/fixtures";

let db: TestDb;
let store: typeof import("../store-server-extension").storeServerExtensionStep;
let rollback: typeof import("../store-server-extension").rollbackStoreServerExtensionStep;
let claimRenewal: typeof import("../../../subscriptions/claim-renewal").claimRenewal;

const SERVER_ID = mockServer.id;
const USER_ID = mockSession.user.id;
const ORDER_ID = "ord_0000000000000000000000001";

/** The term the server starts every test on, and the period that mirrors it. */
const TERM_START = new Date("2026-01-15T09:14:03.000Z");
const TERM_END = new Date("2026-02-15T09:14:03.000Z");

beforeAll(async () => {
  db = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db }));
  ({
    storeServerExtensionStep: store,
    rollbackStoreServerExtensionStep: rollback,
  } = await import("../store-server-extension"));
  ({ claimRenewal } = await import("../../../subscriptions/claim-renewal"));

  await seedServerGraph(db);
});

afterAll(async () => {
  await db.$client.close();
});

beforeEach(async () => {
  await db.delete(schema.subscriptionRenewals);
  await db.delete(schema.subscriptions);
  await db.delete(schema.orders);

  await db
    .update(schema.servers)
    .set({
      installedAt: TERM_START,
      terminatesAt: TERM_END,
      suspendedAt: null,
      renewalReminderSentAt: new Date(),
    })
    .where(eq(schema.servers.id, SERVER_ID));
});

const subscribe = async (
  overrides: Partial<typeof schema.subscriptions.$inferInsert> = {},
) => {
  const [row] = await db
    .insert(schema.subscriptions)
    .values({
      userId: USER_ID,
      subjectId: SERVER_ID,
      serverPlanPriceId: mockServerPlanPrice.id,
      currentPeriodStart: TERM_START,
      currentPeriodEnd: TERM_END,
      autoRenew: false,
      ...overrides,
    })
    .returning();

  if (!row) throw new Error("failed to seed subscription");
  return row;
};

const order = async () => {
  await db.insert(schema.orders).values({
    id: ORDER_ID,
    userId: USER_ID,
    type: "extend_server",
    status: "paid",
    totalAmount: 3499,
    configuration: { type: "extend_server", version: 2, server_id: SERVER_ID },
  });

  return ORDER_ID;
};

const readServer = () =>
  db
    .select({ terminatesAt: schema.servers.terminatesAt })
    .from(schema.servers)
    .where(eq(schema.servers.id, SERVER_ID))
    .then(([row]) => row);

const readSubscription = (id: string) =>
  db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, id))
    .then(([row]) => row);

const readRenewal = (id: string) =>
  db
    .select()
    .from(schema.subscriptionRenewals)
    .where(eq(schema.subscriptionRenewals.id, id))
    .then(([row]) => row);

/**
 * Whether `retryDueRenewals` would pick this renewal up on its next pass.
 *
 * The predicate is copied from `billing/due-renewals.ts` rather than imported,
 * because what is under test is that the row lands in a state that sweep can
 * *see* - a test that called the sweep would need a payment provider, and one
 * that trusted the sweep's own helper would pass even if the predicate moved.
 */
const dueForRetrySweep = async (id: string) =>
  (await db
    .select({ id: schema.subscriptionRenewals.id })
    .from(schema.subscriptionRenewals)
    .where(
      and(
        eq(schema.subscriptionRenewals.id, id),
        eq(schema.subscriptionRenewals.status, "pending"),
        lte(schema.subscriptionRenewals.nextAttemptAt, sql`now()`),
      ),
    )
    .then(([row]) => row)) !== undefined;

/** A renewal for `[periodStart, periodEnd)` against `subscription`. */
const claim = async (
  subscriptionId: string,
  values: Partial<typeof schema.subscriptionRenewals.$inferInsert> & {
    periodStart: Date;
    periodEnd: Date;
  },
) => {
  const [row] = await db
    .insert(schema.subscriptionRenewals)
    .values({ subscriptionId, amount: 3499, ...values })
    .returning();

  if (!row) throw new Error("failed to seed renewal");
  return row;
};

/** Puts the server on a term other than the one `beforeEach` sets. */
const setTerm = (terminatesAt: Date) =>
  db
    .update(schema.servers)
    .set({ terminatesAt })
    .where(eq(schema.servers.id, SERVER_ID));

describe("storeServerExtensionStep", () => {
  test("a server with no subscription extends exactly as it always did", async () => {
    // [!] The path every existing customer is on. Nothing backfills
    // subscriptions, so the overwhelming majority of extensions run with no
    // row to move - and making the subscription a precondition for anything
    // would break renewal for the entire existing fleet at once.
    const result = await store({ serverId: SERVER_ID });

    expect(result.newTerminatesAt?.toISOString()).toBe(
      "2026-03-15T09:14:03.000Z",
    );
    expect(result.previousSubscriptionPeriod).toBeNull();
    expect(result.subscriptionId).toBeNull();
    expect((await readServer())?.terminatesAt?.toISOString()).toBe(
      "2026-03-15T09:14:03.000Z",
    );
  });

  test("an extension moves current_period_end onto the new terminates_at", async () => {
    // [!] The invariant the whole change exists for. A period end behind the
    // term renews a customer who has already paid for the month; a period end
    // ahead of it hands out service nobody is billed for.
    const subscription = await subscribe();

    const { newTerminatesAt } = await store({ serverId: SERVER_ID });
    const after = await readSubscription(subscription.id);

    expect(after?.currentPeriodEnd?.toISOString()).toBe(
      newTerminatesAt?.toISOString(),
    );
    expect((await readServer())?.terminatesAt?.toISOString()).toBe(
      after?.currentPeriodEnd?.toISOString(),
    );
  });

  test("the period start moves onto the previous period end", async () => {
    const subscription = await subscribe();

    await store({ serverId: SERVER_ID });
    const after = await readSubscription(subscription.id);

    // The row now describes the term actually being served, rather than the
    // one that has just run out.
    expect(after?.currentPeriodStart?.toISOString()).toBe(
      TERM_END.toISOString(),
    );
  });

  test("a settled renewal is marked succeeded and stops asking to be retried", async () => {
    const subscription = await subscribe({ status: "past_due" });
    const orderId = await order();

    const [renewal] = await db
      .insert(schema.subscriptionRenewals)
      .values({
        subscriptionId: subscription.id,
        periodStart: TERM_END,
        periodEnd: new Date("2026-03-15T09:14:03.000Z"),
        amount: 3499,
        status: "failed",
        attempt: 2,
        nextAttemptAt: new Date("2026-02-17T09:14:03.000Z"),
        orderId,
      })
      .returning();

    const result = await store({ serverId: SERVER_ID, orderId });

    expect(result.settledRenewalId).toBe(renewal?.id ?? "");

    const [settled] = await db
      .select()
      .from(schema.subscriptionRenewals)
      .where(eq(schema.subscriptionRenewals.id, renewal?.id ?? ""));

    expect(settled?.status).toBe("succeeded");
    expect(settled?.settledAt).not.toBeNull();
    // Left set, the retry sweep picks this up again and charges a customer who
    // has just paid.
    expect(settled?.nextAttemptAt).toBeNull();
  });

  test("settling a renewal returns the subscription to active", async () => {
    const subscription = await subscribe({ status: "past_due" });
    const orderId = await order();

    await db.insert(schema.subscriptionRenewals).values({
      subscriptionId: subscription.id,
      periodStart: TERM_END,
      periodEnd: new Date("2026-03-15T09:14:03.000Z"),
      amount: 3499,
      status: "failed",
      orderId,
    });

    await store({ serverId: SERVER_ID, orderId });

    // A renewal that was paid must not leave the subscription where the
    // dunning ladder can find it again.
    expect((await readSubscription(subscription.id))?.status).toBe("active");
  });

  test("an extension with no renewal behind it leaves the status alone", async () => {
    // A customer pressing "extend" says nothing about whether they meant to
    // resume automatic billing, so it must not walk a cancelled subscription
    // back to active behind their back.
    const subscription = await subscribe({ status: "cancelled" });

    await store({ serverId: SERVER_ID, orderId: await order() });

    expect((await readSubscription(subscription.id))?.status).toBe("cancelled");
  });

  test("the term granted is the one the renewal charged for", async () => {
    // [!] The regression, in its simplest form. The term used to be recomputed
    // as `terminates_at + INTERVAL '1 month'` and the renewal's own period end
    // thrown away, so the customer could be billed to one date and given
    // service to another, with `subscription_renewals.period_end` and
    // `subscriptions.current_period_end` left disagreeing about which.
    const subscription = await subscribe({ status: "past_due" });
    const orderId = await order();
    const periodEnd = new Date("2026-03-20T09:14:03.000Z");

    await claim(subscription.id, {
      periodStart: TERM_END,
      periodEnd,
      status: "collecting",
      orderId,
    });

    const { newTerminatesAt } = await store({ serverId: SERVER_ID, orderId });
    const after = await readSubscription(subscription.id);

    expect(newTerminatesAt?.toISOString()).toBe(periodEnd.toISOString());
    expect((await readServer())?.terminatesAt?.toISOString()).toBe(
      periodEnd.toISOString(),
    );
    expect(after?.currentPeriodEnd?.toISOString()).toBe(
      periodEnd.toISOString(),
    );
    expect(after?.currentPeriodStart?.toISOString()).toBe(
      TERM_END.toISOString(),
    );
  });

  test("an anchored subscription is not walked back off the 31st", async () => {
    // [!] The case `subscriptions/period.ts` exists to prevent. A subscription
    // anchored on the 31st sitting in `31 Jan -> 28 Feb` is charged through
    // 31 Mar, because `billingAnchorDay` recovers 31 from the larger endpoint.
    // `28 Feb + INTERVAL '1 month'` is 28 Mar, and granting that made the next
    // claim read an anchor of `max(28, 28) = 28` - the subscription had moved
    // to the 28th for good, one day of service short of what was billed.
    const anchoredStart = new Date("2026-01-31T09:14:03.000Z");
    const clampedEnd = new Date("2026-02-28T09:14:03.000Z");

    await setTerm(clampedEnd);
    const subscription = await subscribe({
      status: "past_due",
      currentPeriodStart: anchoredStart,
      currentPeriodEnd: clampedEnd,
    });
    const orderId = await order();

    // Exactly what `claimRenewal` would have written for this subscription.
    const chargedThrough = nextPeriodEnd(
      clampedEnd,
      1,
      billingAnchorDay({
        currentPeriodStart: anchoredStart,
        currentPeriodEnd: clampedEnd,
      }),
    );
    expect(chargedThrough.toISOString()).toBe("2026-03-31T09:14:03.000Z");

    await claim(subscription.id, {
      periodStart: clampedEnd,
      periodEnd: chargedThrough,
      status: "collecting",
      orderId,
    });

    await store({ serverId: SERVER_ID, orderId });
    const after = await readSubscription(subscription.id);

    expect((await readServer())?.terminatesAt?.toISOString()).toBe(
      "2026-03-31T09:14:03.000Z",
    );
    expect(after?.currentPeriodEnd?.toISOString()).toBe(
      "2026-03-31T09:14:03.000Z",
    );
    // The anchor survives, so April lands on the 30th rather than the 28th.
    expect(
      billingAnchorDay({
        currentPeriodStart: after?.currentPeriodStart ?? new Date(0),
        currentPeriodEnd: after?.currentPeriodEnd,
      }),
    ).toBe(31);
  });

  test("a quarterly subscription is granted the three months it was charged", async () => {
    // [!] The same line ignored `interval_months` outright: `nextPeriodEnd`
    // charges three months and `+ INTERVAL '1 month'` granted one, so a
    // quarterly customer fell two months behind their own invoice on every
    // renewal.
    const quarterStart = new Date("2025-11-15T09:14:03.000Z");
    const subscription = await subscribe({
      status: "past_due",
      intervalMonths: 3,
      currentPeriodStart: quarterStart,
      currentPeriodEnd: TERM_END,
    });
    const orderId = await order();

    const chargedThrough = nextPeriodEnd(TERM_END, 3, 15);
    expect(chargedThrough.toISOString()).toBe("2026-05-15T09:14:03.000Z");

    await claim(subscription.id, {
      periodStart: TERM_END,
      periodEnd: chargedThrough,
      status: "collecting",
      orderId,
    });

    await store({ serverId: SERVER_ID, orderId });

    expect((await readServer())?.terminatesAt?.toISOString()).toBe(
      "2026-05-15T09:14:03.000Z",
    );
    expect(
      (
        await readSubscription(subscription.id)
      )?.currentPeriodEnd?.toISOString(),
    ).toBe("2026-05-15T09:14:03.000Z");
  });

  test("a renewal that would shorten the term is refused and reported", async () => {
    // A renewal charging through a date the server has already been extended
    // past - by hand, or by an operator - must not pull the term backwards.
    // The month is added instead and the divergence goes to Sentry.
    const subscription = await subscribe({ status: "past_due" });
    const orderId = await order();

    const renewal = await claim(subscription.id, {
      periodStart: new Date("2026-01-15T09:14:03.000Z"),
      periodEnd: new Date("2026-02-01T09:14:03.000Z"),
      status: "collecting",
      orderId,
    });

    const result = await store({ serverId: SERVER_ID, orderId });

    expect(result.newTerminatesAt?.toISOString()).toBe(
      "2026-03-15T09:14:03.000Z",
    );
    // Still settled: the money is real, and a renewal left unsettled is one
    // the retry sweep charges again.
    expect(result.settledRenewalId).toBe(renewal.id);
  });

  test("an order id belonging to another subscription settles nothing", async () => {
    const subscription = await subscribe();
    const orderId = await order();

    const [other] = await db
      .insert(schema.subscriptions)
      .values({
        userId: USER_ID,
        subjectId: "kvm_0000000000000000000000999",
        serverPlanPriceId: mockServerPlanPrice.id,
        currentPeriodStart: TERM_START,
        currentPeriodEnd: TERM_END,
        status: "past_due",
      })
      .returning();

    await db.insert(schema.subscriptionRenewals).values({
      subscriptionId: other?.id ?? "",
      periodStart: TERM_END,
      periodEnd: new Date("2026-03-15T09:14:03.000Z"),
      amount: 3499,
      orderId,
    });

    const result = await store({ serverId: SERVER_ID, orderId });

    expect(result.settledRenewalId).toBeNull();
    expect((await readSubscription(other?.id ?? ""))?.status).toBe("past_due");
    expect((await readSubscription(subscription.id))?.status).toBe("active");
  });
});

describe("rollbackStoreServerExtensionStep", () => {
  test("the period goes back with the term", async () => {
    // The compensation already takes the month back off `terminates_at`.
    // Leaving the subscription a month ahead of it is the divergence that
    // bills a customer for a term they do not have.
    const subscription = await subscribe();

    const { previousSubscriptionPeriod, server } = await store({
      serverId: SERVER_ID,
    });

    await rollback({
      serverId: SERVER_ID,
      suspendedAt: server.suspendedAt,
      previousSubscriptionPeriod,
    });

    const after = await readSubscription(subscription.id);

    expect((await readServer())?.terminatesAt?.toISOString()).toBe(
      TERM_END.toISOString(),
    );
    expect(after?.currentPeriodEnd?.toISOString()).toBe(TERM_END.toISOString());
    expect(after?.currentPeriodStart?.toISOString()).toBe(
      TERM_START.toISOString(),
    );
  });

  test("the settled renewal is un-settled and the sweeps can see it again", async () => {
    // [!] The regression. The compensation put the period back and left the
    // renewal `succeeded`, with `settled_at` set and no `next_attempt_at`:
    // invisible to the retry sweep, invisible to `reconcileRenewals`, and
    // holding `(subscription_id, period_start)` against every future claim. The
    // subscription was never charged again, and eight days later
    // `/api/cron/suspend-terminated-servers` powered off a machine whose owner
    // had a working card on file.
    const subscription = await subscribe({ status: "past_due" });
    const orderId = await order();

    const renewal = await claim(subscription.id, {
      periodStart: TERM_END,
      periodEnd: new Date("2026-03-15T09:14:03.000Z"),
      status: "collecting",
      attempt: 2,
      orderId,
    });

    const {
      server,
      previousTerminatesAt,
      previousSubscriptionPeriod,
      settledRenewalId,
    } = await store({ serverId: SERVER_ID, orderId });

    expect(settledRenewalId).toBe(renewal.id);
    expect((await readRenewal(renewal.id))?.status).toBe("succeeded");

    await rollback({
      serverId: SERVER_ID,
      suspendedAt: server.suspendedAt,
      previousTerminatesAt,
      previousSubscriptionPeriod,
      settledRenewalId,
    });

    const after = await readRenewal(renewal.id);

    expect(after?.status).toBe("pending");
    expect(after?.settledAt).toBeNull();
    // The one thing that makes it reachable again.
    expect(await dueForRetrySweep(renewal.id)).toBe(true);
    // Untouched, so the retry presents the same `renewal:<id>:<attempt>`
    // idempotency key and a provider that already took the money hands back
    // the charge it made rather than making a second one.
    expect(after?.attempt).toBe(2);
  });

  test("the claim on the period is kept, so no second order is raised for it", async () => {
    // The other half of the same decision, stated as a test because it is the
    // obvious alternative fix and it is the wrong one. The renewal row is not
    // dropped: it is the record of a period that was billed, it is what a paid
    // order points at, and releasing `(subscription_id, period_start)` would
    // let the due sweep raise a *second* claim, a second order and a second
    // charge for one month. `claimRenewal` declining a period that already has
    // a live claim is the mechanism working; the retry sweep asserted above is
    // what drives this renewal to completion.
    const subscription = await subscribe({
      status: "past_due",
      autoRenew: true,
    });
    const orderId = await order();

    const renewal = await claim(subscription.id, {
      periodStart: TERM_END,
      periodEnd: new Date("2026-03-15T09:14:03.000Z"),
      status: "collecting",
      orderId,
    });

    const {
      server,
      previousTerminatesAt,
      previousSubscriptionPeriod,
      settledRenewalId,
    } = await store({ serverId: SERVER_ID, orderId });

    await rollback({
      serverId: SERVER_ID,
      suspendedAt: server.suspendedAt,
      previousTerminatesAt,
      previousSubscriptionPeriod,
      settledRenewalId,
    });

    // The period is due again - the rollback put `current_period_end` back on
    // `TERM_END`, which is in the past - so the sweep really does reach the
    // insert rather than bailing out earlier.
    expect(
      (
        await readSubscription(subscription.id)
      )?.currentPeriodEnd?.toISOString(),
    ).toBe(TERM_END.toISOString());

    expect(await claimRenewal(subscription.id)).toBeNull();
    expect(
      await db.$count(
        schema.subscriptionRenewals,
        eq(schema.subscriptionRenewals.subscriptionId, subscription.id),
      ),
    ).toBe(1);
    expect((await readRenewal(renewal.id))?.status).toBe("pending");
  });

  test("a renewal-backed term is restored, not decremented by a month", async () => {
    // The compensation used to subtract a fixed month, which was right only
    // while the forward step added one. A quarterly renewal grants three, and
    // an anchored one grants a month that is not 30 or 31 days long; either
    // would leave the customer holding a term nobody bought.
    const quarterStart = new Date("2025-11-15T09:14:03.000Z");
    const subscription = await subscribe({
      status: "past_due",
      intervalMonths: 3,
      currentPeriodStart: quarterStart,
      currentPeriodEnd: TERM_END,
    });
    const orderId = await order();

    await claim(subscription.id, {
      periodStart: TERM_END,
      periodEnd: new Date("2026-05-15T09:14:03.000Z"),
      status: "collecting",
      orderId,
    });

    const {
      server,
      previousTerminatesAt,
      previousSubscriptionPeriod,
      settledRenewalId,
    } = await store({ serverId: SERVER_ID, orderId });

    expect((await readServer())?.terminatesAt?.toISOString()).toBe(
      "2026-05-15T09:14:03.000Z",
    );

    await rollback({
      serverId: SERVER_ID,
      suspendedAt: server.suspendedAt,
      previousTerminatesAt,
      previousSubscriptionPeriod,
      settledRenewalId,
    });

    expect((await readServer())?.terminatesAt?.toISOString()).toBe(
      TERM_END.toISOString(),
    );
    expect(
      (
        await readSubscription(subscription.id)
      )?.currentPeriodEnd?.toISOString(),
    ).toBe(TERM_END.toISOString());
  });

  test("a rollback for a server with no subscription still restores the term", async () => {
    const { previousSubscriptionPeriod, server } = await store({
      serverId: SERVER_ID,
    });

    await rollback({
      serverId: SERVER_ID,
      suspendedAt: server.suspendedAt,
      previousSubscriptionPeriod,
    });

    expect((await readServer())?.terminatesAt?.toISOString()).toBe(
      TERM_END.toISOString(),
    );
  });
});
