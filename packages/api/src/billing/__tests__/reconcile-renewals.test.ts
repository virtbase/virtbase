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
import { eq } from "@virtbase/db";
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
import type {
  ChargeOffSessionInput,
  OffSessionResult,
  PaymentStatus,
} from "@virtbase/ports";
import {
  mockServer,
  mockServerPlanPrice,
  mockSession,
  seedServerGraph,
} from "../../testing/fixtures";

const testDb: TestDb = await createTestDb();

mock.module("@virtbase/db/client", () => ({ db: testDb }));

/** Every workflow fulfilment enqueued. Settling has to reach these. */
const started: string[] = [];

mock.module("workflow/api", () => ({
  start: async (workflow: { name?: string }) => {
    started.push(workflow?.name ?? "anonymous");
  },
}));

const { integrations } = await import("../../integrations");
const { renewSubscription } = await import("../renew-subscription");
const { reconcileRenewals } = await import("../reconcile-renewals");

const USER_ID = mockSession.user.id;
const SERVER_ID = mockServer.id;
const PERIOD_START = new Date("2020-05-31T09:00:00.000Z");
const PERIOD_END = new Date("2020-06-30T09:00:00.000Z");

const BILLING = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  address: {
    line1: "Hauptstraße 1",
    line2: null,
    city: "Berlin",
    postal_code: "10115",
    country: "DE",
  },
};

let respond: (input: ChargeOffSessionInput) => Promise<OffSessionResult> =
  async () => ({ status: "succeeded", externalId: "pi_ok" });

/** Every intent the reconciler withdrew at the provider, in order. */
let cancelled: string[] = [];

/** What `cancelPayment` does. Throwing is how a provider refuses to cancel. */
let cancel: (externalId: string) => Promise<void> = async (externalId) => {
  cancelled.push(externalId);
};

spyOn(integrations, "resolve").mockResolvedValue({
  method: "stripe",
  createPayment: async () => {
    throw new Error("not part of this surface");
  },
  retrievePayment: async () => {
    throw new Error("reconciliation injects its own resolver in these tests");
  },
  verifyWebhook: async () => null,
  chargeOffSession: async (input: ChargeOffSessionInput) => respond(input),
  cancelPayment: async (externalId: string) => cancel(externalId),
} as never);

/** Reconciliation with an answer from the provider, and no provider. */
const reconcile = (status: PaymentStatus, options = {}) =>
  reconcileRenewals({
    graceMinutes: 0,
    retrievePayment: async (payment) => ({
      externalId: payment.externalId,
      orderId: payment.orderId,
      status,
      total: { amount: payment.amount, currency: payment.currency },
      method: "card",
    }),
    resolveBillingDetails: async () => BILLING,
    ...options,
  });

/**
 * The consent every collectable subscription carries.
 *
 * `claimRenewal` refuses `auto_renew` with no mandate on file - a
 * merchant-initiated charge with no recorded agreement is one the provider
 * reverses on request - so a fixture without this is not a subscription the
 * collector will ever act on.
 */
const MANDATE_ACCEPTED_AT = new Date("2020-05-01T09:00:00.000Z");

const subscribe = async () => {
  const [row] = await testDb
    .insert(subscriptions)
    .values({
      userId: USER_ID,
      subjectId: SERVER_ID,
      serverPlanPriceId: mockServerPlanPrice.id,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      mandateAcceptedAt: MANDATE_ACCEPTED_AT,
    })
    .returning();

  if (!row) throw new Error("failed to seed subscription");

  await testDb.insert(paymentMethods).values({
    userId: USER_ID,
    provider: "stripe",
    externalId: "pm_stripe_default",
    type: "card",
    brand: "visa",
    last4: "4242",
    isDefault: true,
  });

  return row;
};

const readRenewal = (id: string) =>
  testDb
    .select()
    .from(subscriptionRenewals)
    .where(eq(subscriptionRenewals.id, id))
    .limit(1)
    .then(([row]) => {
      if (!row) throw new Error(`renewal ${id} disappeared`);
      return row;
    });

/** A renewal whose charge was submitted and whose answer never came back. */
const strandedCollecting = async () => {
  const subscription = await subscribe();
  respond = async () => ({ status: "succeeded", externalId: "pi_stranded" });

  const { renewalId } = await renewSubscription(subscription.id);
  if (!renewalId) throw new Error("expected a claimed renewal");

  return { subscription, renewalId };
};

beforeEach(async () => {
  started.length = 0;
  cancelled = [];
  cancel = async (externalId) => {
    cancelled.push(externalId);
  };
  respond = async () => ({ status: "succeeded", externalId: "pi_ok" });

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
  await testDb.delete(proxmoxNodes);
  await testDb.delete(proxmoxNodeGroups);
  await testDb.delete(datacenters);
  await testDb.delete(users);

  await seedServerGraph(testDb);
});

afterAll(async () => {
  await testDb.$client.close();
});

describe("a charge whose webhook never arrived", () => {
  test("is settled through the ordinary path", async () => {
    const { renewalId } = await strandedCollecting();

    const result = await reconcile("succeeded");

    expect(result.settled).toBe(1);
    // Settled by supplying the missing event, not by writing the renewal:
    // `applyPaymentEvent` moves the order and `fulfilOrder` starts the
    // extension, which is the only thing that may advance the term.
    expect(started).toContain("extendServerWorkflow");

    const renewal = await readRenewal(renewalId);
    expect(renewal.status).toBe("collecting");
    expect(renewal.settledAt).toBeNull();

    const [order] = await testDb.select().from(orders);
    expect(order?.status).toBe("fulfilled");
  });

  test("is settled exactly once, however often reconciliation runs", async () => {
    await strandedCollecting();

    await reconcile("succeeded");
    await reconcile("succeeded");

    // The synthetic event id is derived from the payment, so the second run
    // loses the `(provider, event_id)` claim like any redelivery.
    expect(await testDb.select().from(paymentEvents)).toHaveLength(1);
    expect(
      started.filter((name) => name === "extendServerWorkflow"),
    ).toHaveLength(1);
  });

  test("does not advance the term itself", async () => {
    const { subscription } = await strandedCollecting();

    await reconcile("succeeded");

    const [after] = await testDb
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscription.id));

    expect(after?.currentPeriodEnd).toEqual(PERIOD_END);
  });
});

describe("a charge the provider reports as failed", () => {
  test("goes onto the dunning ladder", async () => {
    const { subscription, renewalId } = await strandedCollecting();

    const result = await reconcile("failed");
    const renewal = await readRenewal(renewalId);

    expect(result.declined).toBe(1);
    expect(renewal.attempt).toBe(1);
    expect(renewal.status).toBe("pending");
    expect(renewal.nextAttemptAt).not.toBeNull();
    expect(renewal.failureCode).toBe("provider_reported_failure");

    const [after] = await testDb
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscription.id));
    expect(after?.status).toBe("past_due");
  });
});

describe("a charge still in flight", () => {
  test("is left exactly where it is", async () => {
    const { renewalId } = await strandedCollecting();

    const result = await reconcile("processing");

    expect(result.inFlight).toBe(1);
    expect(result.declined).toBe(0);

    const renewal = await readRenewal(renewalId);
    expect(renewal.status).toBe("collecting");
    expect(renewal.attempt).toBe(0);
  });

  test("inside the grace period is not examined at all", async () => {
    await strandedCollecting();

    // The default grace, against a row written a moment ago.
    const result = await reconcileRenewals({
      retrievePayment: async () => {
        throw new Error("the provider must not be asked about a fresh row");
      },
      resolveBillingDetails: async () => BILLING,
    });

    expect(result.examined).toBe(0);
  });
});

describe("an attempt that left no trace of a charge", () => {
  test("is handed back to the retry sweep rather than charged here", async () => {
    const { renewalId } = await strandedCollecting();
    // The worker died before it could record anything about the charge.
    await testDb.delete(payments);

    const result = await reconcile("succeeded");
    const renewal = await readRenewal(renewalId);

    expect(result.rescheduled).toBe(1);
    expect(renewal.status).toBe("pending");
    expect(renewal.nextAttemptAt).not.toBeNull();
    // The attempt is untouched, so the retry presents the same idempotency key
    // and either finds the original charge or makes the first one.
    expect(renewal.attempt).toBe(0);
  });
});

describe("an attempt judged by a previous attempt's charge", () => {
  /**
   * Attempt 1 declines and writes a payment row. Attempt 2 then claims the
   * renewal, submits a second intent at the provider under
   * `renewal:<id>:1` - the attempt count only moves on a *recorded* decline -
   * and the worker dies before it can write anything down.
   *
   * The only payment row on the order is attempt 1's, and it says `failed`.
   */
  const strandedOnASecondAttempt = async () => {
    const subscription = await subscribe();
    respond = async () => ({
      status: "failed",
      externalId: "pi_first_attempt",
      code: "card_declined",
      retryable: true,
      message: "Your card was declined.",
    });

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    const declined = await readRenewal(renewalId);
    expect(declined.attempt).toBe(1);
    expect(declined.status).toBe("pending");

    // The next rung takes the row and dies mid-charge. Exactly what
    // `markRenewalCollecting` leaves behind, `updated_at` included.
    await testDb
      .update(subscriptionRenewals)
      .set({ status: "collecting", nextAttemptAt: null })
      .where(eq(subscriptionRenewals.id, renewalId));

    return { subscription, renewalId };
  };

  test("is not declined on the strength of the older payment", async () => {
    const { subscription, renewalId } = await strandedOnASecondAttempt();

    const result = await reconcileRenewals({
      graceMinutes: 0,
      retrievePayment: async () => {
        // The heart of it. A payment written before this attempt was claimed
        // is a different charge with a different answer, so it must not even
        // be asked about - let alone be allowed to spend a rung, mail the
        // customer, or suspend a server while the intent this attempt really
        // submitted may have succeeded and taken the money.
        throw new Error(
          "the provider must not be asked about a previous attempt's charge",
        );
      },
      resolveBillingDetails: async () => BILLING,
    });

    expect(result.examined).toBe(1);
    expect(result.declined).toBe(0);
    expect(result.failed).toBe(0);

    const renewal = await readRenewal(renewalId);
    // The ladder is exactly where attempt 1 left it.
    expect(renewal.attempt).toBe(1);
    expect(renewal.failureCode).toBe("card_declined");

    const [after] = await testDb
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscription.id));
    expect(after?.status).not.toBe("suspended");
  });

  test("is handed back to the retry sweep under the same idempotency key", async () => {
    const { renewalId } = await strandedOnASecondAttempt();

    const result = await reconcileRenewals({
      graceMinutes: 0,
      retrievePayment: async () => {
        throw new Error("the provider must not be asked about it");
      },
      resolveBillingDetails: async () => BILLING,
    });

    expect(result.rescheduled).toBe(1);

    const renewal = await readRenewal(renewalId);
    expect(renewal.status).toBe("pending");
    expect(renewal.nextAttemptAt).not.toBeNull();
    // Untouched, so the retry presents `renewal:<id>:1` again and the provider
    // answers with the charge it already made under that key rather than
    // making a second one. That is why re-driving cannot double-charge.
    expect(renewal.attempt).toBe(1);
  });

  test("but this attempt's own payment is still what settles it", async () => {
    // The other half of the rule: scoping to the attempt must not stop
    // reconciliation working for the charge this attempt did record.
    const { renewalId } = await strandedOnASecondAttempt();

    // The webhook for the second intent lands, as one does when only the
    // collector's own write was lost.
    await testDb.insert(payments).values({
      orderId: (await readRenewal(renewalId)).orderId,
      userId: USER_ID,
      provider: "stripe",
      externalId: "pi_second_attempt",
      status: "succeeded",
      amount: mockServerPlanPrice.renewalPrice,
      capturedAmount: mockServerPlanPrice.renewalPrice,
      currency: "EUR",
      method: "card",
    });

    const result = await reconcile("succeeded");

    expect(result.settled).toBe(1);
    expect(result.declined).toBe(0);
    expect(started).toContain("extendServerWorkflow");
  });
});

describe("a renewal the customer never authenticated", () => {
  test("falls into the ladder once the window closes", async () => {
    const subscription = await subscribe();
    respond = async () => ({ status: "requires_action", externalId: "pi_3ds" });

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    // The window has closed.
    await testDb
      .update(subscriptionRenewals)
      .set({ nextAttemptAt: new Date("2020-07-01T00:00:00.000Z") })
      .where(eq(subscriptionRenewals.id, renewalId));

    const result = await reconcile("failed");
    const renewal = await readRenewal(renewalId);

    expect(result.declined).toBe(1);
    expect(renewal.attempt).toBe(1);
    expect(renewal.failureCode).toBe("authentication_expired");
    expect(renewal.status).toBe("pending");
  });

  test("but did, and whose webhook was lost, is settled instead", async () => {
    const subscription = await subscribe();
    respond = async () => ({ status: "requires_action", externalId: "pi_3ds" });

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    await testDb
      .update(subscriptionRenewals)
      .set({ nextAttemptAt: new Date("2020-07-01T00:00:00.000Z") })
      .where(eq(subscriptionRenewals.id, renewalId));

    const result = await reconcile("succeeded");
    const renewal = await readRenewal(renewalId);

    expect(result.settled).toBe(1);
    // Authenticating must not cost the customer a rung.
    expect(renewal.attempt).toBe(0);
    expect(started).toContain("extendServerWorkflow");
  });
});

describe("a claim nobody ever charged", () => {
  test("is scheduled rather than charged", async () => {
    const subscription = await subscribe();

    // Exactly what a worker that died between claiming and creating the
    // order leaves behind: pending, no order, nothing scheduled.
    const [renewal] = await testDb
      .insert(subscriptionRenewals)
      .values({
        subscriptionId: subscription.id,
        periodStart: PERIOD_END,
        periodEnd: new Date("2020-07-31T09:00:00.000Z"),
        amount: mockServerPlanPrice.renewalPrice,
      })
      .returning();

    if (!renewal) throw new Error("failed to seed renewal");

    const result = await reconcile("succeeded");
    const after = await readRenewal(renewal.id);

    expect(result.rescheduled).toBe(1);
    expect(after.status).toBe("pending");
    expect(after.nextAttemptAt).not.toBeNull();
    // Reconciliation settles charges that already exist; the retry sweep is
    // the only path that starts one, so no order is created here.
    expect(after.orderId).toBeNull();
  });
});

describe("a batch full of debits that are already known to be moving", () => {
  /**
   * One order with one `processing` payment, shared by every decoy renewal.
   *
   * The renewal rows only have to *occupy* the batch, and what makes them
   * occupy it is that they are `collecting`, older than everything else, and
   * carry a payment we have already recorded as in flight.
   */
  const inFlightDecoys = async (subscriptionId: string, count: number) => {
    const [order] = await testDb
      .insert(orders)
      .values({
        userId: USER_ID,
        type: "extend_server",
        status: "awaiting_payment",
        totalAmount: mockServerPlanPrice.renewalPrice,
        configuration: { type: "extend_server", version: 2 },
      })
      .returning();

    if (!order) throw new Error("failed to seed the decoy order");

    // Recorded half an hour ago: after the claim below, so it belongs to that
    // attempt, and well inside `RENEWAL_IN_FLIGHT_RECHECK_HOURS`.
    await testDb.insert(payments).values({
      orderId: order.id,
      userId: USER_ID,
      provider: "stripe",
      externalId: "pi_sepa_in_flight",
      status: "processing",
      amount: mockServerPlanPrice.renewalPrice,
      capturedAmount: 0,
      currency: "EUR",
      method: "sepa_debit",
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    for (let index = 0; index < count; index++) {
      // A different period each, so each is its own claim on the same
      // subscription; `(subscription_id, period_start)` is the unique key.
      const periodStart = new Date(
        PERIOD_END.getTime() + (index + 1) * 31 * 86_400_000,
      );

      await testDb.insert(subscriptionRenewals).values({
        subscriptionId,
        periodStart,
        periodEnd: new Date(periodStart.getTime() + 30 * 86_400_000),
        amount: mockServerPlanPrice.renewalPrice,
        status: "collecting",
        orderId: order.id,
        // An hour ago, so every one of them sorts ahead of the genuinely
        // stranded renewal the sweep is supposed to rescue.
        updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      });
    }
  };

  test("still reaches the stranded renewal behind them", async () => {
    const { subscription, renewalId } = await strandedCollecting();

    // Four of them against a batch that holds two.
    await inFlightDecoys(subscription.id, 4);

    const result = await reconcile("succeeded", { limit: 2 });

    const renewal = await readRenewal(renewalId);
    const [order] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, renewal.orderId as string));

    // [!] The whole fix in one assertion. Without the anti-join the batch is
    // two of the decoys and this order is still `awaiting_payment`: the
    // customer's card was charged, their server is never extended, and the one
    // row nothing else in the system will ever look at is the one this sweep
    // exists to rescue.
    expect(order?.status).toBe("fulfilled");
    expect(started).toContain("extendServerWorkflow");

    expect(result.examined).toBe(1);
    expect(result.settled).toBe(1);
    expect(result.inFlight).toBe(0);
  });

  test("asks about one again once its answer has gone stale", async () => {
    const subscription = await subscribe();
    await inFlightDecoys(subscription.id, 1);

    // Fresh: the provider has already told us, and telling us again ten
    // minutes later cannot say anything new.
    expect(await reconcile("processing")).toMatchObject({ examined: 0 });

    // Age the whole attempt, claim and payment together: the payment still
    // has to sit at or after the claim it belongs to, which is what
    // `paymentFor` scopes on.
    await testDb
      .update(subscriptionRenewals)
      .set({ updatedAt: new Date(Date.now() - 8 * 60 * 60 * 1000) });
    await testDb
      .update(payments)
      .set({ createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000) })
      .where(eq(payments.externalId, "pi_sepa_in_flight"));

    // Seven hours on, the answer is old enough to be worth asking for again -
    // a settlement whose webhook was lost has to surface eventually.
    expect(await reconcile("processing")).toMatchObject({
      examined: 1,
      inFlight: 1,
    });
  });
});

describe("a charge the provider is holding open for the customer", () => {
  test("is parked in awaiting_action rather than left collecting", async () => {
    const { renewalId } = await strandedCollecting();

    // A worker that died in the instant between Stripe answering
    // `requires_action` and `recordCollectionResult` writing it down. The
    // intent maps to `PaymentStatus 'pending'`: neither succeeded nor failed.
    const result = await reconcile("pending");
    const renewal = await readRenewal(renewalId);

    expect(result.awaitingAction).toBe(1);
    expect(result.inFlight).toBe(0);
    expect(renewal.status).toBe("awaiting_action");
    // Being asked to authenticate is not a decline.
    expect(renewal.attempt).toBe(0);
    expect(renewal.nextAttemptAt).not.toBeNull();
  });

  test("stops being examined by the collecting sweep at all", async () => {
    await strandedCollecting();

    await reconcile("pending");

    // [!] Left `collecting`, this row is re-examined on every run for the life
    // of the table - and a hundred of them is a sweep that never looks at
    // anything else again.
    const second = await reconcile("pending");
    expect(second.awaitingAction).toBe(0);
    expect(second.inFlight).toBe(0);
  });
});

describe("an authentication window that has run out", () => {
  /** A renewal parked on 3-D Secure whose 72 hours are up. */
  const expiredAuthentication = async () => {
    const subscription = await subscribe();
    respond = async () => ({ status: "requires_action", externalId: "pi_3ds" });

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    await testDb
      .update(subscriptionRenewals)
      .set({ nextAttemptAt: new Date("2020-07-01T00:00:00.000Z") })
      .where(eq(subscriptionRenewals.id, renewalId));

    return { subscription, renewalId };
  };

  test("cancels the intent before it spends a rung", async () => {
    const { renewalId } = await expiredAuthentication();

    const result = await reconcile("failed");

    // [!] The intent is live and still confirmable from the link in the
    // customer's banking app. The next attempt builds a new idempotency key -
    // the key carries the attempt, and the rung is what moves it - so without
    // this the provider mints a second intent for the same month and a
    // customer who taps the original on day four pays twice.
    expect(cancelled).toEqual(["pi_3ds"]);
    expect(result.declined).toBe(1);
    expect((await readRenewal(renewalId)).attempt).toBe(1);
  });

  test("spends no rung when the intent cannot be cancelled", async () => {
    const { subscription, renewalId } = await expiredAuthentication();

    cancel = async () => {
      throw new Error("Stripe is having a bad minute");
    };

    const result = await reconcile("failed");
    const renewal = await readRenewal(renewalId);

    // Not cancelled is not safe to retry, so nothing moves: no rung, no
    // second intent, no dunning mail. The next run tries again - and if the
    // reason it would not cancel is that the customer authenticated after
    // all, that run settles it instead.
    expect(result.declined).toBe(0);
    expect(result.failed).toBe(1);
    expect(renewal.status).toBe("awaiting_action");
    expect(renewal.attempt).toBe(0);

    const [after] = await testDb
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscription.id));
    expect(after?.status).not.toBe("suspended");
  });

  test("settles rather than cancels when the customer did authenticate", async () => {
    await expiredAuthentication();

    const result = await reconcile("succeeded");

    // Nothing to withdraw: the money is there, and the branch that cancels is
    // never reached.
    expect(cancelled).toEqual([]);
    expect(result.settled).toBe(1);
  });
});
