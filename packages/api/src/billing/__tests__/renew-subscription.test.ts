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

/**
 * As in `subscriptions/__tests__/claim-renewal.test.ts`: every module in the
 * chain binds `db` at import time, so the in-memory Postgres has to be mocked
 * in before any of them load.
 */
const testDb: TestDb = await createTestDb();

mock.module("@virtbase/db/client", () => ({ db: testDb }));
// Nothing here should reach fulfilment, but `fulfilOrder` is one import away
// through the orders barrel and a real `start` would try to talk to a queue.
mock.module("workflow/api", () => ({ start: async () => {} }));

const { integrations } = await import("../../integrations");
const { renewSubscription, retryRenewal, driveRenewalAttempt } = await import(
  "../renew-subscription"
);

const USER_ID = mockSession.user.id;
const SERVER_ID = mockServer.id;

/** The paid-for period, well in the past so the renewal is due. */
const PERIOD_START = new Date("2020-05-31T09:00:00.000Z");
const PERIOD_END = new Date("2020-06-30T09:00:00.000Z");

/** Every charge the collector attempted, in order. */
let charges: ChargeOffSessionInput[] = [];

/** What the fake provider does next. Replaced per test. */
let respond: (input: ChargeOffSessionInput) => Promise<OffSessionResult> =
  async () => ({ status: "succeeded", externalId: "pi_default" });

const succeeded = (externalId = "pi_ok"): OffSessionResult => ({
  status: "succeeded",
  externalId,
});

const declined = (
  code: string,
  retryable: boolean,
  externalId = "pi_declined",
): OffSessionResult => ({
  status: "failed",
  externalId,
  code,
  retryable,
  message: `Stripe says ${code}.`,
});

/**
 * A payment provider reduced to what collection uses. Resolved through the
 * registry exactly as production does, so the test exercises
 * `requirePaymentCapability` and the real capability lookup rather than a seam
 * cut into the collector for its benefit.
 */
const fakeProvider = {
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
    return respond(input);
  },
};

spyOn(integrations, "resolve").mockResolvedValue(fakeProvider as never);

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

const saveCard = async (
  overrides: Partial<typeof paymentMethods.$inferInsert> = {},
) => {
  const [row] = await testDb
    .insert(paymentMethods)
    .values({
      userId: USER_ID,
      provider: "stripe",
      externalId: "pm_stripe_default",
      type: "card",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
      isDefault: true,
      ...overrides,
    })
    .returning();

  if (!row) throw new Error("failed to seed payment method");
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

const readSubscription = (id: string) =>
  testDb
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .limit(1)
    .then(([row]) => {
      if (!row) throw new Error(`subscription ${id} disappeared`);
      return row;
    });

/** Drags a scheduled retry into the past so the ladder can be walked quickly. */
const makeDue = (renewalId: string) =>
  testDb
    .update(subscriptionRenewals)
    .set({ nextAttemptAt: sql`now() - INTERVAL '1 minute'` })
    .where(eq(subscriptionRenewals.id, renewalId));

const minutesFromNow = (date: Date) => (date.getTime() - Date.now()) / 60_000;

beforeEach(async () => {
  charges = [];
  respond = async () => succeeded();

  // Reverse foreign-key order, so every test starts from the same database.
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

describe("a provider that cannot be reached", () => {
  test("does not spend an attempt", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => {
      throw new Error("connect ETIMEDOUT api.stripe.com:443");
    };

    const result = await renewSubscription(subscription.id);

    expect(result.outcome).toBe("rescheduled");
    if (!result.renewalId) throw new Error("expected a claimed renewal");

    const renewal = await readRenewal(result.renewalId);

    // The whole point: an hour of somebody else's downtime must not climb the
    // dunning ladder for customers whose cards were fine.
    expect(renewal.attempt).toBe(0);
    expect(renewal.status).toBe("pending");
    // Recorded as our own failure rather than as a decline, and rather than
    // left saying whatever the last real decline said. It is also the marker
    // `rescheduleAfterTransportError` reads back to tell one bad minute from a
    // provider that has been unusable for half a day.
    expect(renewal.failureCode).toBe("transport_unavailable");
    expect(renewal.settledAt).toBeNull();
  });

  test("reschedules with a backoff instead of retrying immediately", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => {
      throw new Error("503 from the provider");
    };

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    const renewal = await readRenewal(renewalId);

    expect(renewal.nextAttemptAt).not.toBeNull();
    // 15 minutes, and emphatically not the ladder's first rung a day out.
    expect(minutesFromNow(renewal.nextAttemptAt as Date)).toBeGreaterThan(10);
    expect(minutesFromNow(renewal.nextAttemptAt as Date)).toBeLessThan(20);
  });

  test("leaves the subscription alone, because nothing was declined", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => {
      throw new Error("socket hang up");
    };

    await renewSubscription(subscription.id);

    // `past_due` is a statement about the customer. Our own timeout is not.
    expect((await readSubscription(subscription.id)).status).toBe("active");
  });

  test("retries the same attempt under the same idempotency key", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => {
      throw new Error("connection reset");
    };

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    respond = async () => succeeded("pi_recovered");
    await makeDue(renewalId);
    await retryRenewal(renewalId);

    expect(charges).toHaveLength(2);
    // A lost response and a retry must present one key, so a charge the
    // provider did make comes back rather than being made twice.
    expect(charges[0]?.idempotencyKey).toBe(`renewal:${renewalId}:0`);
    expect(charges[1]?.idempotencyKey).toBe(`renewal:${renewalId}:0`);
  });
});

describe("the idempotency key", () => {
  test("names the renewal and the attempt", async () => {
    const subscription = await subscribe();
    await saveCard();

    const { renewalId } = await renewSubscription(subscription.id);

    expect(charges[0]?.idempotencyKey).toBe(`renewal:${renewalId}:0`);
  });

  test("changes when the ladder moves to the next rung", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => declined("insufficient_funds", true);

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    await makeDue(renewalId);
    await retryRenewal(renewalId);

    // A deliberate next rung has to make a *new* charge, or the ladder replays
    // one dead authorisation four times and the customer is never re-presented.
    expect(charges.map((charge) => charge.idempotencyKey)).toEqual([
      `renewal:${renewalId}:0`,
      `renewal:${renewalId}:1`,
    ]);
  });
});

describe("an authentication the customer has to finish", () => {
  test("does not spend an attempt", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => ({
      status: "requires_action",
      externalId: "pi_3ds",
      clientSecret: "pi_3ds_secret",
    });

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    const renewal = await readRenewal(renewalId);

    expect(renewal.status).toBe("awaiting_action");
    // Nothing was declined: the intent is live and still chargeable.
    expect(renewal.attempt).toBe(0);
    expect(renewal.failureCode).toBeNull();
  });

  test("parks the renewal against the authentication window", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => ({ status: "requires_action", externalId: "pi_3ds" });

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    const renewal = await readRenewal(renewalId);
    const hours = minutesFromNow(renewal.nextAttemptAt as Date) / 60;

    expect(hours).toBeGreaterThan(71);
    expect(hours).toBeLessThan(73);
    expect((await readSubscription(subscription.id)).status).toBe("past_due");
  });
});

describe("a decline", () => {
  test("spends one rung and schedules the next", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => declined("insufficient_funds", true);

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    const renewal = await readRenewal(renewalId);

    expect(renewal.attempt).toBe(1);
    expect(renewal.status).toBe("pending");
    expect(renewal.failureCode).toBe("insufficient_funds");
    // The first rung is a day out.
    const days = minutesFromNow(renewal.nextAttemptAt as Date) / (60 * 24);
    expect(days).toBeGreaterThan(0.9);
    expect(days).toBeLessThan(1.1);
    expect((await readSubscription(subscription.id)).status).toBe("past_due");
  });

  test("the provider says can never work skips the rest of the ladder", async () => {
    const subscription = await subscribe();
    const card = await saveCard();

    respond = async () => declined("stolen_card", false);

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    const renewal = await readRenewal(renewalId);

    // Past the last rung, with nothing scheduled: presenting a card the issuer
    // has buried four more times is four more declines and four more emails.
    expect(renewal.attempt).toBeGreaterThan(4);
    expect(renewal.status).toBe("failed");
    expect(renewal.nextAttemptAt).toBeNull();
    expect(renewal.settledAt).not.toBeNull();

    // The credential is named, so the next attempt refuses locally and the
    // dunning email can say which card to fix.
    const [stored] = await testDb
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.id, card.id));
    expect(stored?.invalidAt).not.toBeNull();
    expect(stored?.invalidReason).toBe("stolen_card");

    // `past_due`, not suspended: this card will not pay, which is not the same
    // as the customer refusing to.
    expect((await readSubscription(subscription.id)).status).toBe("past_due");

    // And nothing retries it.
    const retried = await retryRenewal(renewalId);
    expect(retried.outcome).toBe("superseded");
    expect(charges).toHaveLength(1);
  });

  test("on the last rung suspends the subscription and abandons the renewal", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => declined("insufficient_funds", true);

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    // Four declines already recorded: the next one is off the end of the
    // ladder. Written directly rather than by waiting seven days.
    await testDb
      .update(subscriptionRenewals)
      .set({ attempt: 4, status: "pending" })
      .where(eq(subscriptionRenewals.id, renewalId));
    await makeDue(renewalId);

    const result = await retryRenewal(renewalId);
    const renewal = await readRenewal(renewalId);

    expect(result.outcome).toBe("exhausted");
    expect(renewal.status).toBe("abandoned");
    expect(renewal.attempt).toBe(5);
    expect(renewal.nextAttemptAt).toBeNull();
    expect(renewal.settledAt).not.toBeNull();
    expect((await readSubscription(subscription.id)).status).toBe("suspended");
  });
});

describe("a customer with nothing to charge", () => {
  test("is refused without the provider being called", async () => {
    const subscription = await subscribe();

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    const renewal = await readRenewal(renewalId);

    expect(charges).toHaveLength(0);
    expect(renewal.failureCode).toBe("no_payment_method");
    // Retryable: the ladder is exactly the window in which a card is added.
    expect(renewal.attempt).toBe(1);
    expect(renewal.nextAttemptAt).not.toBeNull();
  });

  test("whose only card is already known dead is refused locally", async () => {
    const subscription = await subscribe();
    await saveCard({ invalidAt: new Date("2020-01-01T00:00:00.000Z") });

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    expect(charges).toHaveLength(0);
    expect((await readRenewal(renewalId)).failureCode).toBe(
      "payment_method_invalid",
    );
  });
});

describe("a charge that went through", () => {
  test("leaves the renewal collecting for the webhook to settle", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => succeeded("pi_paid");

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    const renewal = await readRenewal(renewalId);

    // Submitted is not settled. `storeServerExtensionStep` is the only thing
    // that may write `succeeded`, and only once the extension is fulfilled.
    expect(renewal.status).toBe("collecting");
    expect(renewal.settledAt).toBeNull();
    expect(renewal.nextAttemptAt).toBeNull();
    expect(renewal.orderId).not.toBeNull();
    expect((await readSubscription(subscription.id)).status).toBe("active");
  });

  test("records the payment so reconciliation can find the charge", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => succeeded("pi_recorded");

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    const [payment] = await testDb
      .select()
      .from(payments)
      .where(eq(payments.externalId, "pi_recorded"));

    expect(payment?.status).toBe("succeeded");
    expect(payment?.amount).toBe(mockServerPlanPrice.renewalPrice);
    expect(payment?.orderId).toBe((await readRenewal(renewalId)).orderId);
  });
});

describe("the term", () => {
  test("is never advanced by any collection outcome", async () => {
    const outcomes: (() => Promise<OffSessionResult>)[] = [
      async () => succeeded("pi_term_1"),
      async () => ({ status: "processing", externalId: "pi_term_2" }),
      async () => ({ status: "requires_action", externalId: "pi_term_3" }),
      async () => declined("insufficient_funds", true),
      async () => declined("stolen_card", false),
    ];

    for (const outcome of outcomes) {
      await testDb.delete(payments);
      await testDb.delete(subscriptionRenewals);
      await testDb.delete(subscriptions);
      await testDb.delete(orderItems);
      await testDb.delete(orderTransitions);
      await testDb.delete(orders);
      await testDb.delete(paymentMethods);

      const subscription = await subscribe();
      await saveCard();
      respond = outcome;

      await renewSubscription(subscription.id);

      const after = await readSubscription(subscription.id);

      // The term moves in exactly one place - `storeServerExtensionStep`, in
      // the transaction that also moves `servers.terminates_at` - and only
      // once a payment has actually settled.
      expect(after.currentPeriodEnd).toEqual(PERIOD_END);
      expect(after.currentPeriodStart).toEqual(PERIOD_START);
    }
  });

  test("is not advanced by a transport failure either", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => {
      throw new Error("gateway timeout");
    };

    await renewSubscription(subscription.id);

    const after = await readSubscription(subscription.id);
    expect(after.currentPeriodEnd).toEqual(PERIOD_END);
  });
});

describe("claiming", () => {
  test("is left to the claim: a second worker collects nothing", async () => {
    const subscription = await subscribe();
    await saveCard();

    const first = await renewSubscription(subscription.id);
    const second = await renewSubscription(subscription.id);

    expect(first.outcome).toBe("collecting");
    expect(second.outcome).toBe("not_claimed");
    expect(charges).toHaveLength(1);
  });

  test("does not run again for a retry, which has no claim to take", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => declined("processing_error", true);

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    await makeDue(renewalId);
    respond = async () => succeeded("pi_second_rung");

    const retried = await retryRenewal(renewalId);

    // A retry that went through `claimRenewal` would lose its own conflict and
    // report the period as somebody else's, forever.
    expect(retried.outcome).toBe("collecting");
    expect(await testDb.select().from(subscriptionRenewals)).toHaveLength(1);
  });

  test("stops retrying a subscription the customer has cancelled", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => declined("insufficient_funds", true);

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    await testDb
      .update(subscriptions)
      .set({ status: "cancelled" })
      .where(eq(subscriptions.id, subscription.id));
    await makeDue(renewalId);

    const retried = await retryRenewal(renewalId);

    expect(retried.outcome).toBe("not_collectable");
    expect((await readRenewal(renewalId)).status).toBe("abandoned");
    expect(charges).toHaveLength(1);
  });

  test("keeps collecting for a subscription the term sweep has suspended", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => declined("insufficient_funds", true);

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    // What `/api/cron/suspend-terminated-servers` does within fifteen minutes
    // of any period ending. The ladder has to survive it, or dunning ends on
    // its first rung for very nearly every customer.
    await testDb
      .update(subscriptions)
      .set({ status: "suspended" })
      .where(eq(subscriptions.id, subscription.id));
    await makeDue(renewalId);
    respond = async () => succeeded("pi_rescued");

    const retried = await retryRenewal(renewalId);

    expect(retried.outcome).toBe("collecting");
    expect(charges).toHaveLength(2);
  });
});

describe("an attempt already in flight", () => {
  test("cannot be taken twice", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => declined("insufficient_funds", true);
    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    // Another worker holds it.
    await testDb
      .update(subscriptionRenewals)
      .set({ status: "collecting" })
      .where(eq(subscriptionRenewals.id, renewalId));

    const claimed = await readRenewal(renewalId);
    const result = await driveRenewalAttempt(claimed);

    expect(result.outcome).toBe("superseded");
    expect(charges).toHaveLength(1);
  });
});

describe("a provider that has been unusable for hours", () => {
  /**
   * The failure modes that look like an outage and are not: the integration
   * switched off in admin, a secret rotated to another account, a stored token
   * the provider answers `resource_missing` for, a currency the account cannot
   * take. Every one of them throws rather than returning a decline, and every
   * one of them will still be throwing next week.
   */
  const unreachable = () => {
    respond = async () => {
      throw new Error("No such payment_method: 'pm_stripe_default'");
    };
  };

  /** Ages the whole attempt, which is what "we have heard nothing" means. */
  const silentSince = (renewalId: string, hoursAgo: number) =>
    testDb
      .update(subscriptionRenewals)
      .set({
        createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
        nextAttemptAt: sql`now() - INTERVAL '1 minute'`,
        status: "pending",
      })
      .where(eq(subscriptionRenewals.id, renewalId));

  test("is still forgiven while the failure is only minutes old", async () => {
    const subscription = await subscribe();
    await saveCard();
    unreachable();

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    await makeDue(renewalId);
    const retried = await retryRenewal(renewalId);

    // Two transport failures in a row is a bad ten minutes, not a
    // misconfiguration. An hour of somebody else's downtime must still not
    // climb the ladder for customers whose cards were fine.
    expect(retried.outcome).toBe("rescheduled");
    expect((await readRenewal(renewalId)).attempt).toBe(0);
    expect((await readSubscription(subscription.id)).status).toBe("active");
  });

  test("becomes a decline once it has gone on for half a day", async () => {
    const subscription = await subscribe();
    await saveCard();
    unreachable();

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    // Twelve hours of fifteen-minute retries, none of which ever reached the
    // provider and none of which told the customer anything.
    await silentSince(renewalId, 13);

    const retried = await retryRenewal(renewalId);
    const renewal = await readRenewal(renewalId);

    // [!] The bound. Without it this reschedules every fifteen minutes for
    // ever: `attempt` never moves so the ladder never exhausts,
    // `notifyRenewalDecline` is never reached so no dunning mail is ever
    // sent, and the server is suspended at `terminates_at +
    // RENEWAL_SUSPENSION_GRACE_DAYS` with the customer never having been
    // warned at all.
    expect(retried.outcome).toBe("retry_scheduled");
    expect(renewal.attempt).toBe(1);
    expect(renewal.failureCode).toBe("transport_unavailable");
    expect(renewal.status).toBe("pending");
    // The ladder's own rung, a day out - not the fifteen-minute backoff.
    expect(minutesFromNow(renewal.nextAttemptAt as Date)).toBeGreaterThan(60);
    // And the customer's standing now says what is actually true.
    expect((await readSubscription(subscription.id)).status).toBe("past_due");
  });

  test("counts silence from the provider's last word, not from the claim", async () => {
    const subscription = await subscribe();
    await saveCard();

    // A real decline: the provider answered, and `recordCollectionResult`
    // wrote the payment row that is the record of it.
    respond = async () => declined("insufficient_funds", true);

    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    unreachable();
    // The claim is old - it is a week into the ladder - but the provider spoke
    // to us moments ago, so this transport failure is the first of its run and
    // must not be escalated on the strength of the claim's age.
    await silentSince(renewalId, 24);
    await testDb
      .update(subscriptionRenewals)
      .set({ failureCode: "transport_unavailable" })
      .where(eq(subscriptionRenewals.id, renewalId));

    const retried = await retryRenewal(renewalId);

    expect(retried.outcome).toBe("rescheduled");
    // Still on the rung the real decline bought, not one further along.
    expect((await readRenewal(renewalId)).attempt).toBe(1);
  });
});

describe("a renewal that settled while a retry was reading it", () => {
  test("is not dragged to abandoned by the retry", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => declined("insufficient_funds", true);
    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    // What `storeServerExtensionStep` writes in the transaction that moves the
    // term: the renewal paid for, settled, and the period advanced.
    await testDb
      .update(subscriptionRenewals)
      .set({
        status: "succeeded",
        settledAt: sql`now()`,
        failureCode: null,
        failureMessage: null,
      })
      .where(eq(subscriptionRenewals.id, renewalId));

    // And the subscription has since ended - the customer cancelled, or the
    // server was deleted - which is what sends `retryRenewal` down its
    // not-collectable branch.
    await testDb
      .update(subscriptions)
      .set({ status: "ended", endedAt: sql`now()` })
      .where(eq(subscriptions.id, subscription.id));

    const result = await retryRenewal(renewalId);
    const renewal = await readRenewal(renewalId);

    expect(result.outcome).toBe("not_collectable");

    // [!] Guarded on the statuses that may be abandoned, never on whatever the
    // read a moment earlier happened to see. Otherwise this fires
    // `WHERE status = 'succeeded'`, the billing history claims a period the
    // customer paid for was abandoned, and
    // `rollbackStoreServerExtensionStep`'s own `WHERE status = 'succeeded'`
    // guard no longer matches anything.
    expect(renewal.status).toBe("succeeded");
    expect(renewal.failureMessage).toBeNull();
  });

  test("still abandons one that really is waiting", async () => {
    const subscription = await subscribe();
    await saveCard();

    respond = async () => declined("insufficient_funds", true);
    const { renewalId } = await renewSubscription(subscription.id);
    if (!renewalId) throw new Error("expected a claimed renewal");

    await testDb
      .update(subscriptions)
      .set({ status: "cancelled" })
      .where(eq(subscriptions.id, subscription.id));

    const result = await retryRenewal(renewalId);
    const renewal = await readRenewal(renewalId);

    // Left `pending` with a due `next_attempt_at`, this row is picked up by
    // every retry sweep for the rest of the table's life.
    expect(result.outcome).toBe("not_collectable");
    expect(renewal.status).toBe("abandoned");
    expect(renewal.nextAttemptAt).toBeNull();
    expect(renewal.settledAt).not.toBeNull();
  });
});
