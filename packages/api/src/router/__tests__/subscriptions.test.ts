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
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { TRPCError } from "@trpc/server";
import type { Session } from "@virtbase/auth";
import { eq } from "@virtbase/db";
import {
  orders,
  paymentMethods,
  payments,
  servers,
  subscriptionRenewals,
  subscriptions,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { SUBSCRIPTION_MANDATE_TEXT_VERSION } from "@virtbase/validators";
import {
  mockServer,
  mockServerPlanPrice,
  mockSession,
  seedServerInfrastructure,
} from "../../testing/fixtures";

/**
 * `transitionSubscription` binds `db` at import time and the router calls it,
 * so the module has to be mocked in before `root` loads - otherwise the
 * cancel and resume paths would write to a different database than the one
 * the caller reads from, and every assertion after a transition would be a
 * lie. Same trick the subscription domain tests use.
 */
const testDb: TestDb = await createTestDb();
mock.module("@virtbase/db/client", () => ({ db: testDb }));

/**
 * The seam the enrolment race needs.
 *
 * `setAutoRenew` asks the collector whether there is a credential worth
 * enrolling against, and the collector binds its own `db` - so that question
 * is answered on a different connection from the one that writes the flag, and
 * the answer can stop being true in between. Nothing a fixture can set up
 * reproduces that; the removal has to land *while* the mutation is running,
 * which is what this hook is for.
 *
 * The real module is captured as a plain object first and the replacement
 * delegates to that copy, never back through the namespace: `mock.module` is
 * global to the whole test run, so reading the export back would be an
 * infinite recursion, and returning a bare object would strip every other
 * export out from under the billing suites.
 */
const realCollect = { ...(await import("../../billing/collect")) };

/** Armed by one test, fired once, immediately after the collector answers. */
let afterResolvingPaymentMethod: (() => Promise<void>) | null = null;

mock.module("../../billing/collect", () => ({
  ...realCollect,
  resolveRenewalPaymentMethod: async (subscriptionId: string) => {
    const resolved =
      await realCollect.resolveRenewalPaymentMethod(subscriptionId);

    const hook = afterResolvingPaymentMethod;
    afterResolvingPaymentMethod = null;
    await hook?.();

    return resolved;
  },
}));

const { appRouter } = await import("../../root");

type Caller = ReturnType<typeof appRouter.createCaller>;

const USER_A = mockSession.user.id;
const USER_B = "usr_0000000000000000000000001";
const SERVER_A = mockServer.id;
const SERVER_B = "kvm_0000000000000000000000001";

const sessionB = {
  session: { ...mockSession.session, id: "sess_0000000000000000000000001" },
  user: {
    ...mockSession.user,
    id: USER_B,
    email: "other@example.com",
    name: "Other User",
  },
} satisfies Session;

let caller: Caller;
/** The other customer, whose subscriptions must be untouchable from `caller`. */
let otherCaller: Caller;
/** Authenticates the way the public API does: a key in the header, no session. */
let apiKeyCaller: Caller;
let unauthenticatedCaller: Caller;

const MONTH = 1000 * 60 * 60 * 24 * 30;

const subscribe = async (
  values: Partial<typeof subscriptions.$inferInsert> & { userId: string },
) => {
  const row = await testDb
    .insert(subscriptions)
    .values({
      subjectId: SERVER_A,
      serverPlanPriceId: mockServerPlanPrice.id,
      currentPeriodStart: new Date(Date.now() - MONTH),
      currentPeriodEnd: new Date(Date.now() + MONTH),
      // Matches what `createServerSubscriptionStep` writes: nothing existing
      // is enrolled in automatic charging.
      autoRenew: false,
      ...values,
    })
    .returning()
    .then(([created]) => created ?? null);

  if (!row) throw new Error("Failed to insert subscription");

  return row;
};

const insertMethod = async (
  values: Partial<typeof paymentMethods.$inferInsert> & { userId: string },
) => {
  const row = await testDb
    .insert(paymentMethods)
    .values({
      provider: "stripe",
      externalId: `pm_stripe_${Math.random().toString(36).slice(2)}`,
      type: "card",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
      ...values,
    })
    .returning()
    .then(([created]) => created ?? null);

  if (!row) throw new Error("Failed to insert payment method");

  return row;
};

/**
 * A claimed period, in whatever state the test needs it to be in.
 *
 * `(subscription_id, period_start)` is unique - the claim *is* the insert - so
 * a test that wants two of them has to move the period.
 */
const insertRenewal = async (
  values: Partial<typeof subscriptionRenewals.$inferInsert> & {
    subscriptionId: string;
  },
) => {
  const row = await testDb
    .insert(subscriptionRenewals)
    .values({
      periodStart: new Date(Date.now() + MONTH),
      periodEnd: new Date(Date.now() + 2 * MONTH),
      amount: 1000,
      ...values,
    })
    .returning()
    .then(([created]) => created ?? null);

  if (!row) throw new Error("Failed to insert renewal");

  return row;
};

const readRow = (id: string) =>
  testDb
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .limit(1)
    .then(([row]) => row ?? null);

beforeAll(async () => {
  await testDb
    .insert(users)
    .values([mockSession.user, sessionB.user])
    .onConflictDoNothing();

  await seedServerInfrastructure(testDb);

  await testDb
    .insert(servers)
    .values([
      mockServer,
      {
        ...mockServer,
        id: SERVER_B,
        userId: USER_B,
        name: "Their server",
        vmid: 101,
      },
    ])
    .onConflictDoNothing();

  const sharedContext = {
    db: testDb as never,
    headers: new Headers(),
    setHeader: () => {},
  };

  caller = appRouter.createCaller({
    ...sharedContext,
    authApi: {} as never,
    apiKey: null,
    session: mockSession,
  });

  otherCaller = appRouter.createCaller({
    ...sharedContext,
    authApi: {} as never,
    apiKey: null,
    session: sessionB,
  });

  apiKeyCaller = appRouter.createCaller({
    ...sharedContext,
    authApi: {
      verifyApiKey: async () => ({
        valid: true,
        error: null,
        key: { referenceId: USER_A },
      }),
    } as never,
    apiKey: "vb_test_key",
    session: null,
  });

  unauthenticatedCaller = appRouter.createCaller({
    ...sharedContext,
    authApi: {} as never,
    apiKey: null,
    session: null,
  });
});

afterAll(async () => {
  await testDb.$client.close();
});

afterEach(async () => {
  afterResolvingPaymentMethod = null;
  await testDb.delete(subscriptions);
  await testDb.delete(paymentMethods);
});

describe("subscriptions.list", () => {
  test("it returns the caller's subscriptions with the subject, period and flag", async () => {
    const subscription = await subscribe({ userId: USER_A });

    const { subscriptions: rows } = await caller.subscriptions.list();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: subscription.id,
      subject_type: "server",
      subject_id: SERVER_A,
      subject_name: mockServer.name,
      status: "active",
      auto_renew: false,
      interval_months: 1,
      currency: "EUR",
      payment_method: null,
      mandate_accepted_at: null,
    });
    expect(rows[0]?.current_period_end).toEqual(subscription.currentPeriodEnd);
    expect(rows[0]?.current_period_start).toEqual(
      subscription.currentPeriodStart,
    );
  });

  test("it never returns the provider or its credential token", async () => {
    const method = await insertMethod({
      userId: USER_A,
      externalId: "pm_stripe_secret_token",
    });
    await subscribe({ userId: USER_A, paymentMethodId: method.id });

    const list = await caller.subscriptions.list();
    const [row] = list.subscriptions;

    expect(row?.payment_method).toEqual({
      id: method.id,
      brand: "visa",
      last4: "4242",
    });
    // The token an off-session charge is made against must not reach a client.
    expect(JSON.stringify(list)).not.toContain("pm_stripe_secret_token");
    expect(JSON.stringify(list)).not.toContain("stripe");
    expect(Object.keys(row?.payment_method ?? {}).sort()).toEqual([
      "brand",
      "id",
      "last4",
    ]);
    expect(Object.keys(row ?? {}).sort()).toEqual([
      "auto_renew",
      "cancel_reason",
      "cancelled_at",
      "created_at",
      "currency",
      "current_period_end",
      "current_period_start",
      "id",
      "interval_months",
      "mandate_accepted_at",
      "payment_method",
      "status",
      "subject_id",
      "subject_name",
      "subject_type",
    ]);
  });

  test("it shows the account default when the subscription names no credential", async () => {
    const fallback = await insertMethod({
      userId: USER_A,
      isDefault: true,
      last4: "1881",
    });
    await subscribe({ userId: USER_A, paymentMethodId: null });

    const { subscriptions: rows } = await caller.subscriptions.list();

    // Null means "whatever is default at collection time", so this is what
    // would actually be charged.
    expect(rows[0]?.payment_method).toEqual({
      id: fallback.id,
      brand: "visa",
      last4: "1881",
    });
  });

  test("it survives a subject that has been destroyed", async () => {
    // `subject_id` is deliberately not a foreign key - a subscription outlives
    // the server it paid for - so the name is simply gone.
    await subscribe({ userId: USER_A, subjectId: "kvm_deleted_server" });

    const { subscriptions: rows } = await caller.subscriptions.list();

    expect(rows[0]?.subject_id).toBe("kvm_deleted_server");
    expect(rows[0]?.subject_name).toBeNull();
  });

  test("it does not return another customer's subscriptions", async () => {
    await subscribe({ userId: USER_B, subjectId: SERVER_B });

    expect((await caller.subscriptions.list()).subscriptions).toEqual([]);
    expect((await otherCaller.subscriptions.list()).subscriptions).toHaveLength(
      1,
    );
  });

  test("it never returns the provider's transaction id either", async () => {
    // The admin console shows `payments.external_id` on purpose - it is what
    // support pastes into the provider's dashboard. This asserts the boundary
    // from the other side: adding that surface must never widen this one.
    const method = await insertMethod({
      userId: USER_A,
      externalId: "pm_customer_facing_leak",
    });
    const subscription = await subscribe({
      userId: USER_A,
      paymentMethodId: method.id,
    });

    const [order] = await testDb
      .insert(orders)
      .values({
        userId: USER_A,
        type: "extend_server",
        status: "paid",
        totalAmount: 1000,
        configuration: {},
      })
      .returning();
    if (!order) throw new Error("Failed to insert order");

    await insertRenewal({ subscriptionId: subscription.id, orderId: order.id });
    await testDb.insert(payments).values({
      userId: USER_A,
      orderId: order.id,
      provider: "stripe",
      externalId: "pi_customer_facing_leak",
      amount: 1000,
    });

    const list = await caller.subscriptions.list();

    expect(JSON.stringify(list)).not.toContain("pi_customer_facing_leak");
    expect(JSON.stringify(list)).not.toContain("pm_customer_facing_leak");
    expect(JSON.stringify(list)).not.toContain("external_id");

    await testDb.delete(payments);
    await testDb.delete(subscriptionRenewals);
    await testDb.delete(orders);
  });
});

describe("subscriptions.acceptMandate", () => {
  test("it records the wording and the moment it was accepted", async () => {
    const subscription = await subscribe({ userId: USER_A });

    const result = await caller.subscriptions.acceptMandate({
      id: subscription.id,
      version: SUBSCRIPTION_MANDATE_TEXT_VERSION,
    });

    expect(result.subscription.mandate_accepted_at).toBeInstanceOf(Date);

    const row = await readRow(subscription.id);
    expect(row?.mandateAcceptedAt).toBeInstanceOf(Date);
    // The version is the half that makes the timestamp worth anything: "they
    // accepted something" is not a defence in a dispute.
    expect(row?.mandateTextVersion).toBe(SUBSCRIPTION_MANDATE_TEXT_VERSION);
  });

  test("it refuses a version that is not the wording in force", async () => {
    const subscription = await subscribe({ userId: USER_A });

    await expect(
      caller.subscriptions.acceptMandate({
        id: subscription.id,
        // Shaped like a version, and not one we have ever shown anyone. A
        // client that can name its own version can claim the customer agreed
        // to text that never existed.
        version: "1999-01-01",
      }),
    ).rejects.toThrow("That is not the agreement currently in force.");

    const row = await readRow(subscription.id);
    expect(row?.mandateAcceptedAt).toBeNull();
    expect(row?.mandateTextVersion).toBeNull();
  });

  test("it refuses a version that is not even a version", async () => {
    const subscription = await subscribe({ userId: USER_A });

    await expect(
      caller.subscriptions.acceptMandate({
        id: subscription.id,
        version: "the one I liked",
      }),
    ).rejects.toThrow();

    expect((await readRow(subscription.id))?.mandateAcceptedAt).toBeNull();
  });

  test("it does not turn automatic renewal on", async () => {
    // A usable credential is on file, so the *only* thing standing between
    // this subscription and an off-session charge is the flag itself.
    await insertMethod({ userId: USER_A, isDefault: true });
    const subscription = await subscribe({ userId: USER_A, autoRenew: false });

    const result = await caller.subscriptions.acceptMandate({
      id: subscription.id,
      version: SUBSCRIPTION_MANDATE_TEXT_VERSION,
    });

    // Reading the terms is not enrolling in them. Consent and enrolment are
    // two decisions, and conflating them is a pre-ticked box wearing a
    // dialog's clothes.
    expect(result.subscription.auto_renew).toBe(false);
    expect((await readRow(subscription.id))?.autoRenew).toBe(false);
  });

  test("re-accepting updates both columns", async () => {
    const subscription = await subscribe({
      userId: USER_A,
      mandateAcceptedAt: new Date("2020-01-01T00:00:00.000Z"),
      mandateTextVersion: "2020-01-01",
    });

    await caller.subscriptions.acceptMandate({
      id: subscription.id,
      version: SUBSCRIPTION_MANDATE_TEXT_VERSION,
    });

    const row = await readRow(subscription.id);
    expect(row?.mandateTextVersion).toBe(SUBSCRIPTION_MANDATE_TEXT_VERSION);
    expect(row?.mandateAcceptedAt?.getFullYear()).toBeGreaterThan(2020);
  });

  test("it cannot accept on another customer's subscription", async () => {
    const theirs = await subscribe({ userId: USER_B, subjectId: SERVER_B });

    await expect(
      caller.subscriptions.acceptMandate({
        id: theirs.id,
        version: SUBSCRIPTION_MANDATE_TEXT_VERSION,
      }),
    ).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));

    // Not merely refused - untouched. An unscoped `WHERE` would show up here.
    const row = await readRow(theirs.id);
    expect(row?.mandateAcceptedAt).toBeNull();
    expect(row?.mandateTextVersion).toBeNull();
  });

  test("a recorded mandate is what setAutoRenew was waiting for", async () => {
    await insertMethod({ userId: USER_A, isDefault: true });
    const subscription = await subscribe({ userId: USER_A });

    await expect(
      caller.subscriptions.setAutoRenew({ id: subscription.id, enabled: true }),
    ).rejects.toThrow(
      "Automatic renewal needs your agreement to automatic charges.",
    );

    await caller.subscriptions.acceptMandate({
      id: subscription.id,
      version: SUBSCRIPTION_MANDATE_TEXT_VERSION,
    });

    const result = await caller.subscriptions.setAutoRenew({
      id: subscription.id,
      enabled: true,
    });

    expect(result.subscription.auto_renew).toBe(true);
  });
});

describe("subscriptions.retryNow", () => {
  test("it refuses while the renewal is already being collected", async () => {
    const subscription = await subscribe({ userId: USER_A, autoRenew: true });
    const renewal = await insertRenewal({
      subscriptionId: subscription.id,
      status: "collecting",
    });

    await expect(
      caller.subscriptions.retryNow({ id: subscription.id }),
    ).rejects.toThrow("being collected right now");

    // Refused before the collector was touched: the attempt in flight still
    // owns the row.
    const row = await testDb
      .select()
      .from(subscriptionRenewals)
      .where(eq(subscriptionRenewals.id, renewal.id))
      .then(([first]) => first);
    expect(row?.status).toBe("collecting");
  });

  test("it refuses a renewal the customer's bank is still waiting on", async () => {
    const subscription = await subscribe({ userId: USER_A, autoRenew: true });
    const renewal = await insertRenewal({
      subscriptionId: subscription.id,
      status: "awaiting_action",
      attempt: 1,
      // The authentication deadline, three days out. The provider's
      // idempotency key expires a day into it, so a press on the second day
      // would build a key the provider no longer knows and make a second
      // charge beside a first one the customer can still confirm.
      nextAttemptAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    await expect(
      caller.subscriptions.retryNow({ id: subscription.id }),
    ).rejects.toThrow("Your bank still needs you to confirm this payment.");

    const row = await testDb
      .select()
      .from(subscriptionRenewals)
      .where(eq(subscriptionRenewals.id, renewal.id))
      .then(([first]) => first);
    // Untouched: the live authentication still owns the row, and the attempt
    // number - which *is* the idempotency key - has not moved.
    expect(row?.status).toBe("awaiting_action");
    expect(row?.attempt).toBe(1);
  });

  test("the refusal names the confirmation and what happens if it never comes", async () => {
    const subscription = await subscribe({ userId: USER_A });
    await insertRenewal({
      subscriptionId: subscription.id,
      status: "awaiting_action",
    });

    // Not a generic "cannot be retried": there is something for the customer
    // to do, and something we do if they do not.
    await expect(
      caller.subscriptions.retryNow({ id: subscription.id }),
    ).rejects.toThrow(/Finish that confirmation.*we retry by ourselves/s);
  });

  test("it refuses when there is nothing to retry", async () => {
    const subscription = await subscribe({ userId: USER_A });

    await expect(
      caller.subscriptions.retryNow({ id: subscription.id }),
    ).rejects.toThrow("There is no renewal to retry.");
  });

  test("it refuses a renewal that has already been paid", async () => {
    const subscription = await subscribe({ userId: USER_A });
    await insertRenewal({
      subscriptionId: subscription.id,
      status: "succeeded",
    });

    await expect(
      caller.subscriptions.retryNow({ id: subscription.id }),
    ).rejects.toThrow("already been paid");
  });

  test("it refuses a renewal that is out of rungs", async () => {
    const subscription = await subscribe({ userId: USER_A });
    await insertRenewal({ subscriptionId: subscription.id, status: "failed" });

    await expect(
      caller.subscriptions.retryNow({ id: subscription.id }),
    ).rejects.toThrow("cannot be retried");
  });

  test("it cannot retry another customer's renewal", async () => {
    const theirs = await subscribe({ userId: USER_B, subjectId: SERVER_B });
    await insertRenewal({ subscriptionId: theirs.id, status: "collecting" });

    // `subscription_renewals` carries no `user_id`, so the scoping has to come
    // from the subscription read - and it does, before the renewal is looked
    // up at all.
    await expect(
      caller.subscriptions.retryNow({ id: theirs.id }),
    ).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));
  });
});

describe("subscriptions.setAutoRenew", () => {
  test("it refuses to turn renewal on with no payment method", async () => {
    const subscription = await subscribe({
      userId: USER_A,
      mandateAcceptedAt: new Date(),
    });

    await expect(
      caller.subscriptions.setAutoRenew({ id: subscription.id, enabled: true }),
    ).rejects.toThrow("Automatic renewal needs a usable payment method.");

    expect((await readRow(subscription.id))?.autoRenew).toBe(false);
  });

  test("it refuses to turn renewal on with no recorded mandate", async () => {
    await insertMethod({ userId: USER_A, isDefault: true });
    const subscription = await subscribe({
      userId: USER_A,
      mandateAcceptedAt: null,
    });

    await expect(
      caller.subscriptions.setAutoRenew({ id: subscription.id, enabled: true }),
    ).rejects.toThrow(
      "Automatic renewal needs your agreement to automatic charges.",
    );

    expect((await readRow(subscription.id))?.autoRenew).toBe(false);
  });

  test("it names both when both are missing", async () => {
    const subscription = await subscribe({ userId: USER_A });

    await expect(
      caller.subscriptions.setAutoRenew({ id: subscription.id, enabled: true }),
    ).rejects.toThrow(
      "Automatic renewal needs a usable payment method and your agreement to automatic charges.",
    );
  });

  test("it refuses a credential the provider has marked dead", async () => {
    await insertMethod({
      userId: USER_A,
      isDefault: true,
      invalidAt: new Date(),
      invalidReason: "expired_card",
    });
    const subscription = await subscribe({
      userId: USER_A,
      mandateAcceptedAt: new Date(),
    });

    await expect(
      caller.subscriptions.setAutoRenew({ id: subscription.id, enabled: true }),
    ).rejects.toThrow("Automatic renewal needs a usable payment method.");
  });

  test("a named credential stands on its own, not on the default", async () => {
    // A valid default is present, and must not rescue a subscription that
    // names a dead card - the customer chose that one.
    await insertMethod({ userId: USER_A, isDefault: true });
    const named = await insertMethod({
      userId: USER_A,
      invalidAt: new Date(),
      last4: "0000",
    });
    const subscription = await subscribe({
      userId: USER_A,
      paymentMethodId: named.id,
      mandateAcceptedAt: new Date(),
    });

    await expect(
      caller.subscriptions.setAutoRenew({ id: subscription.id, enabled: true }),
    ).rejects.toThrow("Automatic renewal needs a usable payment method.");
  });

  test("a named credential that is gone falls through to the default", async () => {
    // The exact shape the collector already handles: the customer removed the
    // card their subscription names and still has a live default.
    // `resolveRenewalPaymentMethod` charges the default, so refusing here
    // would tell them to add a payment method they already have and send them
    // to a billing page with nothing on it to fix.
    const fallback = await insertMethod({
      userId: USER_A,
      isDefault: true,
      last4: "1881",
    });
    const removed = await insertMethod({
      userId: USER_A,
      detachedAt: new Date(),
      last4: "0000",
    });
    const subscription = await subscribe({
      userId: USER_A,
      // The pointer is deliberately left behind. Removal clears it, but this
      // has to be right in the window before that write lands as well as
      // after it.
      paymentMethodId: removed.id,
      mandateAcceptedAt: new Date(),
    });

    const result = await caller.subscriptions.setAutoRenew({
      id: subscription.id,
      enabled: true,
    });

    expect(result.subscription.auto_renew).toBe(true);
    expect((await readRow(subscription.id))?.autoRenew).toBe(true);
    // And the dashboard names the card that would actually be charged, not
    // the one that was thrown away.
    expect(result.subscription.payment_method).toEqual({
      id: fallback.id,
      brand: "visa",
      last4: "1881",
    });
  });

  test("a named credential that is gone with no default is still refused", async () => {
    const removed = await insertMethod({
      userId: USER_A,
      detachedAt: new Date(),
    });
    const subscription = await subscribe({
      userId: USER_A,
      paymentMethodId: removed.id,
      mandateAcceptedAt: new Date(),
    });

    // Falling through is not the same as waving it through: with nothing left
    // to fall through *to*, the collection would fail and the refusal stands.
    await expect(
      caller.subscriptions.setAutoRenew({ id: subscription.id, enabled: true }),
    ).rejects.toThrow("Automatic renewal needs a usable payment method.");

    expect((await readRow(subscription.id))?.autoRenew).toBe(false);
  });

  test("it turns renewal on once a mandate and a usable credential exist", async () => {
    await insertMethod({ userId: USER_A, isDefault: true });
    const subscription = await subscribe({
      userId: USER_A,
      mandateAcceptedAt: new Date("2026-08-01T00:00:00.000Z"),
      mandateTextVersion: "2026-08-01",
    });

    const result = await caller.subscriptions.setAutoRenew({
      id: subscription.id,
      enabled: true,
    });

    expect(result.subscription.auto_renew).toBe(true);
    expect((await readRow(subscription.id))?.autoRenew).toBe(true);
  });

  test("it turns renewal off with no preconditions at all", async () => {
    const subscription = await subscribe({ userId: USER_A, autoRenew: true });

    const result = await caller.subscriptions.setAutoRenew({
      id: subscription.id,
      enabled: false,
    });

    expect(result.subscription.auto_renew).toBe(false);
    expect((await readRow(subscription.id))?.autoRenew).toBe(false);
  });

  test("it refuses to enrol a subscription the collector would skip", async () => {
    await insertMethod({ userId: USER_A, isDefault: true });
    const subscription = await subscribe({
      userId: USER_A,
      status: "cancelled",
      mandateAcceptedAt: new Date(),
    });

    await expect(
      caller.subscriptions.setAutoRenew({ id: subscription.id, enabled: true }),
    ).rejects.toThrow("Resume this subscription before");

    expect((await readRow(subscription.id))?.autoRenew).toBe(false);
  });

  test("a credential removed between the check and the write does not enrol", async () => {
    // The whole reason the preconditions are re-asserted in the `WHERE`. The
    // customer presses the switch in one tab while the card is removed in
    // another - or while `payment_method.detached` arrives from Stripe - and
    // the check has already said yes by the time the update runs. Letting it
    // land enrols a subscription with no credential behind it: renewal shown
    // as on in the dashboard, `no_payment_method` at the first collection, and
    // the customer walked down the entire dunning ladder for nothing.
    const card = await insertMethod({ userId: USER_A, isDefault: true });
    const subscription = await subscribe({
      userId: USER_A,
      mandateAcceptedAt: new Date(),
    });

    afterResolvingPaymentMethod = async () => {
      await testDb
        .update(paymentMethods)
        .set({ detachedAt: new Date(), isDefault: false })
        .where(eq(paymentMethods.id, card.id));
    };

    await expect(
      caller.subscriptions.setAutoRenew({ id: subscription.id, enabled: true }),
    ).rejects.toThrow("Automatic renewal was not turned on");

    expect((await readRow(subscription.id))?.autoRenew).toBe(false);
  });

  test("a mandate withdrawn between the check and the write does not enrol", async () => {
    // The same hole, on the other precondition. `acceptMandate` is the only
    // thing that writes `mandate_accepted_at`, but an erasure or an operator
    // clearing it has the same effect, and the flag must not outlive the
    // consent it was granted on.
    await insertMethod({ userId: USER_A, isDefault: true });
    const subscription = await subscribe({
      userId: USER_A,
      mandateAcceptedAt: new Date(),
    });

    afterResolvingPaymentMethod = async () => {
      await testDb
        .update(subscriptions)
        .set({ mandateAcceptedAt: null })
        .where(eq(subscriptions.id, subscription.id));
    };

    await expect(
      caller.subscriptions.setAutoRenew({ id: subscription.id, enabled: true }),
    ).rejects.toThrow("Automatic renewal was not turned on");

    expect((await readRow(subscription.id))?.autoRenew).toBe(false);
  });

  test("a cancellation between the check and the write does not enrol", async () => {
    // `cancel` turns `auto_renew` off and then transitions the row. Reaching
    // the write after that transition and setting the flag back on would
    // re-enrol a subscription the customer has just left, and `claimRenewal`
    // would skip it anyway - a stored instruction nothing can carry out.
    await insertMethod({ userId: USER_A, isDefault: true });
    const subscription = await subscribe({
      userId: USER_A,
      mandateAcceptedAt: new Date(),
    });

    afterResolvingPaymentMethod = async () => {
      await testDb
        .update(subscriptions)
        .set({ status: "cancelled" })
        .where(eq(subscriptions.id, subscription.id));
    };

    await expect(
      caller.subscriptions.setAutoRenew({ id: subscription.id, enabled: true }),
    ).rejects.toThrow("Automatic renewal was not turned on");

    expect((await readRow(subscription.id))?.autoRenew).toBe(false);
  });

  test("turning renewal off is never refused by the guards", async () => {
    // The guards are on the way *on* only. A subscription that has stopped
    // being enrollable must still be able to stop renewing - withdrawing
    // consent to be charged is never gated, and that includes not being gated
    // by a conflict.
    const subscription = await subscribe({
      userId: USER_A,
      status: "suspended",
      autoRenew: true,
      mandateAcceptedAt: null,
    });

    const result = await caller.subscriptions.setAutoRenew({
      id: subscription.id,
      enabled: false,
    });

    expect(result.subscription.auto_renew).toBe(false);
    expect((await readRow(subscription.id))?.autoRenew).toBe(false);
  });

  test("it cannot change another customer's subscription", async () => {
    // Their renewal is *on*, so an unscoped write would show up here as well
    // as an unscoped read: the assertion below fails either way.
    const theirs = await subscribe({
      userId: USER_B,
      subjectId: SERVER_B,
      autoRenew: true,
    });

    await expect(
      caller.subscriptions.setAutoRenew({ id: theirs.id, enabled: false }),
    ).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));

    // Not merely refused - untouched.
    const row = await readRow(theirs.id);
    expect(row?.userId).toBe(USER_B);
    expect(row?.autoRenew).toBe(true);
  });
});

describe("subscriptions.cancel", () => {
  test("it stops renewal without moving the paid-for period", async () => {
    const subscription = await subscribe({ userId: USER_A, autoRenew: true });

    const result = await caller.subscriptions.cancel({ id: subscription.id });

    expect(result.subscription.status).toBe("cancelled");
    expect(result.subscription.auto_renew).toBe(false);
    // The term the customer paid for is theirs. Cancelling means "do not
    // charge me again", never "take away what I already bought".
    expect(result.subscription.current_period_end).toEqual(
      subscription.currentPeriodEnd,
    );

    const row = await readRow(subscription.id);
    expect(row?.currentPeriodEnd).toEqual(subscription.currentPeriodEnd);
    expect(row?.currentPeriodStart).toEqual(subscription.currentPeriodStart);
    expect(row?.autoRenew).toBe(false);
    expect(row?.status).toBe("cancelled");
    expect(row?.cancelledAt).toBeInstanceOf(Date);
    expect(row?.endedAt).toBeNull();
  });

  test("it leaves the server's own termination date alone", async () => {
    const subscription = await subscribe({ userId: USER_A });

    await caller.subscriptions.cancel({ id: subscription.id });

    const server = await testDb
      .select()
      .from(servers)
      .where(eq(servers.id, SERVER_A))
      .then(([row]) => row);

    expect(server?.terminatesAt).toEqual(mockServer.terminatesAt);
    expect(server?.suspendedAt).toBeNull();
  });

  test("it takes no reason and needs exactly one call (§312k BGB)", async () => {
    const subscription = await subscribe({ userId: USER_A, autoRenew: true });

    // No reason, no confirmation step, no second call.
    const result = await caller.subscriptions.cancel({ id: subscription.id });

    expect(result.subscription.status).toBe("cancelled");
    // The controlled vocabulary, not free text a customer wrote.
    expect((await readRow(subscription.id))?.cancelReason).toBe("customer");
  });

  test("a reason is accepted and never lands in cancel_reason", async () => {
    const subscription = await subscribe({ userId: USER_A });

    await caller.subscriptions.cancel({
      id: subscription.id,
      reason: "Too expensive for a side project",
    });

    expect((await readRow(subscription.id))?.cancelReason).toBe("customer");
  });

  test("cancelling twice is not an error", async () => {
    const subscription = await subscribe({ userId: USER_A });

    await caller.subscriptions.cancel({ id: subscription.id });
    const second = await caller.subscriptions.cancel({ id: subscription.id });

    expect(second.subscription.status).toBe("cancelled");
  });

  test("a suspended subscription still stops renewing", async () => {
    // `suspended -> cancelled` is not a legal transition, so the status stays
    // put; what the customer asked for - never charge me again - still happens.
    const subscription = await subscribe({
      userId: USER_A,
      status: "suspended",
      autoRenew: true,
    });

    const result = await caller.subscriptions.cancel({ id: subscription.id });

    expect(result.subscription.auto_renew).toBe(false);
    expect(result.subscription.status).toBe("suspended");
  });

  test("it refuses a subscription that has already ended", async () => {
    const subscription = await subscribe({ userId: USER_A, status: "ended" });

    await expect(
      caller.subscriptions.cancel({ id: subscription.id }),
    ).rejects.toThrow("already ended");
  });

  test("it cannot cancel another customer's subscription", async () => {
    const theirs = await subscribe({ userId: USER_B, subjectId: SERVER_B });

    await expect(
      caller.subscriptions.cancel({ id: theirs.id }),
    ).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));

    const row = await readRow(theirs.id);
    expect(row?.status).toBe("active");
    expect(row?.cancelledAt).toBeNull();
  });

  test("neither customer can cancel the other's subscription", async () => {
    const mine = await subscribe({ userId: USER_A });

    await expect(
      otherCaller.subscriptions.cancel({ id: mine.id }),
    ).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));

    expect((await readRow(mine.id))?.status).toBe("active");
  });
});

describe("subscriptions.resume", () => {
  test("it reactivates a cancellation taken back inside the paid period", async () => {
    const subscription = await subscribe({
      userId: USER_A,
      status: "cancelled",
      cancelledAt: new Date(),
      cancelReason: "customer",
      currentPeriodEnd: new Date(Date.now() + MONTH),
    });

    const result = await caller.subscriptions.resume({ id: subscription.id });

    expect(result.subscription.status).toBe("active");
    expect(result.subscription.cancelled_at).toBeNull();
    expect(result.subscription.cancel_reason).toBeNull();
    expect(result.subscription.current_period_end).toEqual(
      subscription.currentPeriodEnd,
    );
  });

  test("it does not turn automatic renewal back on", async () => {
    const subscription = await subscribe({
      userId: USER_A,
      status: "cancelled",
      autoRenew: false,
    });

    const result = await caller.subscriptions.resume({ id: subscription.id });

    // Resuming is a statement about the current term, not consent to be
    // charged for the next one. That is `setAutoRenew`, with its own
    // preconditions.
    expect(result.subscription.auto_renew).toBe(false);
    expect((await readRow(subscription.id))?.autoRenew).toBe(false);
  });

  test("it refuses once the paid-for period has run out", async () => {
    const subscription = await subscribe({
      userId: USER_A,
      status: "cancelled",
      currentPeriodStart: new Date(Date.now() - 2 * MONTH),
      currentPeriodEnd: new Date(Date.now() - 1000),
    });

    await expect(
      caller.subscriptions.resume({ id: subscription.id }),
    ).rejects.toThrow("The paid-for period has ended");

    expect((await readRow(subscription.id))?.status).toBe("cancelled");
  });

  test("it refuses a subscription that was never cancelled", async () => {
    const subscription = await subscribe({ userId: USER_A });

    await expect(
      caller.subscriptions.resume({ id: subscription.id }),
    ).rejects.toThrow("Only a cancelled subscription can be resumed.");
  });

  test("it cannot resume another customer's subscription", async () => {
    const theirs = await subscribe({
      userId: USER_B,
      subjectId: SERVER_B,
      status: "cancelled",
    });

    await expect(
      caller.subscriptions.resume({ id: theirs.id }),
    ).rejects.toThrow(new TRPCError({ code: "NOT_FOUND" }));

    expect((await readRow(theirs.id))?.status).toBe("cancelled");
  });
});

describe("API key authentication", () => {
  /**
   * These procedures declare no `permissions`, so the auth middleware refuses
   * a key before the handler runs; each mutation then repeats the check the
   * way `checkout.order` does. A leaked key that can point renewals at a saved
   * card, or cancel a customer's services, is a materially worse incident than
   * one that can only read.
   */
  test("a key cannot turn automatic renewal on", async () => {
    const subscription = await subscribe({ userId: USER_A });

    await expect(
      apiKeyCaller.subscriptions.setAutoRenew({
        id: subscription.id,
        enabled: true,
      }),
    ).rejects.toThrow(new TRPCError({ code: "FORBIDDEN" }));

    expect((await readRow(subscription.id))?.autoRenew).toBe(false);
  });

  test("a key cannot record a mandate", async () => {
    const subscription = await subscribe({ userId: USER_A });

    await expect(
      apiKeyCaller.subscriptions.acceptMandate({
        id: subscription.id,
        version: SUBSCRIPTION_MANDATE_TEXT_VERSION,
      }),
    ).rejects.toThrow(new TRPCError({ code: "FORBIDDEN" }));

    // Consent is a statement by a human. A bearer credential with nobody
    // behind it must not be able to make one on their behalf.
    const row = await readRow(subscription.id);
    expect(row?.mandateAcceptedAt).toBeNull();
    expect(row?.mandateTextVersion).toBeNull();
  });

  test("a key cannot force a collection attempt", async () => {
    const subscription = await subscribe({ userId: USER_A });
    const renewal = await insertRenewal({ subscriptionId: subscription.id });

    await expect(
      apiKeyCaller.subscriptions.retryNow({ id: subscription.id }),
    ).rejects.toThrow(new TRPCError({ code: "FORBIDDEN" }));

    const row = await testDb
      .select()
      .from(subscriptionRenewals)
      .where(eq(subscriptionRenewals.id, renewal.id))
      .then(([first]) => first);
    expect(row?.status).toBe("pending");
  });

  test("a key cannot cancel", async () => {
    const subscription = await subscribe({ userId: USER_A, autoRenew: true });

    await expect(
      apiKeyCaller.subscriptions.cancel({ id: subscription.id }),
    ).rejects.toThrow(new TRPCError({ code: "FORBIDDEN" }));

    const row = await readRow(subscription.id);
    expect(row?.status).toBe("active");
    expect(row?.autoRenew).toBe(true);
  });

  test("a key cannot resume", async () => {
    const subscription = await subscribe({
      userId: USER_A,
      status: "cancelled",
    });

    await expect(
      apiKeyCaller.subscriptions.resume({ id: subscription.id }),
    ).rejects.toThrow(new TRPCError({ code: "FORBIDDEN" }));

    expect((await readRow(subscription.id))?.status).toBe("cancelled");
  });

  test("a key cannot read them either", async () => {
    await subscribe({ userId: USER_A });

    await expect(apiKeyCaller.subscriptions.list()).rejects.toThrow(
      new TRPCError({ code: "FORBIDDEN" }),
    );
  });
});

describe("authentication", () => {
  test("an unauthenticated caller is refused", async () => {
    await expect(unauthenticatedCaller.subscriptions.list()).rejects.toThrow(
      new TRPCError({ code: "UNAUTHORIZED" }),
    );
  });
});
