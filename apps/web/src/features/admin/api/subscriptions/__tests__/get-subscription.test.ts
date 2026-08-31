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
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

import * as actualReact from "react";

/**
 * The identity, not the memo, and spread over the real module: `mock.module`
 * is process-wide in bun, so a bare `{ cache }` would take `createContext`
 * away from every component suite that runs after this file.
 */
mock.module("react", () => ({
  ...actualReact,
  default: actualReact,
  cache: (fn: (...args: never) => unknown) => fn,
}));
mock.module("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
mock.module("@sentry/nextjs", () => ({ captureException: () => {} }));

/**
 * The authorisation gate, stubbed so it can be made to refuse on demand.
 *
 * The real one is exercised in `api/__tests__/verify-session.test.ts`; what
 * matters here is that every reader in this directory goes through it, and
 * that a refusal reaches the caller instead of being swallowed into an empty
 * page.
 */
let refusal: Error | null = null;
mock.module("../../verify-session", () => ({
  verifySession: async () => {
    if (refusal) throw refusal;

    return { user: { id: "usr_admin", role: "ADMIN" } };
  },
}));

import { mockServer, seedServerGraph } from "@virtbase/api/testing/fixtures";
import { eq } from "@virtbase/db";
import {
  orders,
  paymentMethods,
  payments,
  subscriptionRenewals,
  subscriptions,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import {
  insertOrder,
  insertPayment,
  insertPaymentMethod,
  insertRenewal,
  insertSubscription,
  MONTH,
} from "./fixtures";

let testDb: TestDb;
let getSubscription: typeof import("../get-subscription").getSubscription;

beforeAll(async () => {
  testDb = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db: testDb }));

  await seedServerGraph(testDb);

  const mod = await import("../get-subscription");
  getSubscription = mod.getSubscription;
});

afterAll(async () => {
  await testDb.$client.close();
});

beforeEach(() => {
  refusal = null;
});

afterEach(async () => {
  await testDb.delete(subscriptionRenewals);
  await testDb.delete(subscriptions);
  await testDb.delete(payments);
  await testDb.delete(paymentMethods);
  await testDb.delete(orders);
});

describe("getSubscription authorisation", () => {
  test("a non-admin never reaches the data", async () => {
    const subscription = await insertSubscription(testDb);

    refusal = new Error("NEXT_NOT_FOUND");

    // Not "returns nothing" - the refusal has to propagate. A reader that
    // caught this and returned an empty detail would render an admin page to
    // somebody who may not see one.
    await expect(getSubscription(subscription.id)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("getSubscription", () => {
  test("it returns null for an id that does not exist", async () => {
    expect(await getSubscription("sub_does_not_exist")).toBeNull();
  });

  test("it returns the subscription, its period, mandate and price", async () => {
    const acceptedAt = new Date(Date.now() - MONTH);
    const subscription = await insertSubscription(testDb, {
      autoRenew: true,
      mandateAcceptedAt: acceptedAt,
      mandateTextVersion: "2026-08-30",
      intervalMonths: 3,
    });

    const detail = await getSubscription(subscription.id);

    expect(detail).toMatchObject({
      id: subscription.id,
      status: "active",
      subjectType: "server",
      subjectId: mockServer.id,
      subjectName: mockServer.name,
      autoRenew: true,
      intervalMonths: 3,
      currency: "EUR",
      mandateTextVersion: "2026-08-30",
    });
    expect(detail?.mandateAcceptedAt).toEqual(acceptedAt);
    expect(detail?.customer.email).toBe("test@example.com");
    // What was agreed at signup, from the price row the subscription was
    // opened against.
    expect(detail?.agreedPrice).toMatchObject({
      purchasePrice: 2999,
      renewalPrice: 3499,
    });
  });

  test("it renders a cancelled subscription's reason", async () => {
    const subscription = await insertSubscription(testDb, {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelReason: "dunning_exhausted",
    });

    const detail = await getSubscription(subscription.id);

    expect(detail?.status).toBe("cancelled");
    expect(detail?.cancelReason).toBe("dunning_exhausted");
  });

  test("a subscription with no renewals yet returns empty collections", async () => {
    const subscription = await insertSubscription(testDb);

    const detail = await getSubscription(subscription.id);

    // The common case on this branch, and the one the detail page has to
    // render as an empty state rather than a broken table.
    expect(detail?.renewals).toEqual([]);
    expect(detail?.payments).toEqual([]);
    expect(detail?.paymentMethods).toEqual([]);
  });

  test("it surfaces the provider's decline code verbatim", async () => {
    const subscription = await insertSubscription(testDb);
    await insertRenewal(testDb, {
      subscriptionId: subscription.id,
      status: "failed",
      attempt: 2,
      // Not a code the adapter knows about. Storing and showing it unmapped is
      // the whole point: the one nobody anticipated is the one support needs.
      failureCode: "insufficient_funds",
      failureMessage: "Your card has insufficient funds.",
      nextAttemptAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    const detail = await getSubscription(subscription.id);
    const [renewal] = detail?.renewals ?? [];

    expect(renewal?.failureCode).toBe("insufficient_funds");
    expect(renewal?.failureMessage).toBe("Your card has insufficient funds.");
    expect(renewal?.status).toBe("failed");
    expect(renewal?.attempt).toBe(2);
    expect(renewal?.nextAttemptAt).toBeInstanceOf(Date);
  });

  test("it orders renewals newest period first and links the order", async () => {
    const subscription = await insertSubscription(testDb);
    const order = await insertOrder(testDb, {
      status: "paid",
      paidAt: new Date(),
    });

    await insertRenewal(testDb, {
      subscriptionId: subscription.id,
      periodStart: new Date(Date.now() + MONTH),
      periodEnd: new Date(Date.now() + 2 * MONTH),
      status: "succeeded",
      orderId: order.id,
    });
    await insertRenewal(testDb, {
      subscriptionId: subscription.id,
      periodStart: new Date(Date.now() + 2 * MONTH),
      periodEnd: new Date(Date.now() + 3 * MONTH),
      status: "pending",
    });

    const detail = await getSubscription(subscription.id);

    expect(detail?.renewals).toHaveLength(2);
    expect(detail?.renewals[0]?.status).toBe("pending");
    // A renewal that never reached a charge has no order, and saying so is
    // itself an answer.
    expect(detail?.renewals[0]?.order).toBeNull();
    expect(detail?.renewals[1]?.order).toMatchObject({
      id: order.id,
      status: "paid",
      totalAmount: 3499,
    });
  });

  test("it shows the provider transaction id of the payments behind those renewals", async () => {
    const subscription = await insertSubscription(testDb);
    const order = await insertOrder(testDb);
    await insertRenewal(testDb, {
      subscriptionId: subscription.id,
      orderId: order.id,
      status: "failed",
      failureCode: "card_declined",
    });
    await insertPayment(testDb, {
      orderId: order.id,
      externalId: "pi_3PtransactionABC",
      status: "failed",
      failureReason: "card_declined",
    });

    const detail = await getSubscription(subscription.id);

    // The string support pastes into the provider's dashboard. Admin is the
    // one surface where it legitimately appears.
    expect(detail?.payments).toHaveLength(1);
    expect(detail?.payments[0]).toMatchObject({
      provider: "stripe",
      externalId: "pi_3PtransactionABC",
      status: "failed",
      amount: 3499,
    });
  });

  test("a payment on an unrelated order is not attributed to this subscription", async () => {
    const subscription = await insertSubscription(testDb);
    const mine = await insertOrder(testDb);
    const theirs = await insertOrder(testDb);

    await insertRenewal(testDb, {
      subscriptionId: subscription.id,
      orderId: mine.id,
    });
    await insertPayment(testDb, {
      orderId: mine.id,
      externalId: "pi_mine",
    });
    await insertPayment(testDb, {
      orderId: theirs.id,
      externalId: "pi_theirs",
    });

    const detail = await getSubscription(subscription.id);

    expect(detail?.payments.map((payment) => payment.externalId)).toEqual([
      "pi_mine",
    ]);
  });

  test("it never returns a stored credential's provider token", async () => {
    const subscription = await insertSubscription(testDb);
    const method = await insertPaymentMethod(testDb, {
      externalId: "pm_stripe_secret_token",
      isDefault: true,
    });
    await testDb
      .update(subscriptions)
      .set({ paymentMethodId: method.id })
      .where(eq(subscriptions.id, subscription.id));

    const detail = await getSubscription(subscription.id);

    expect(detail?.paymentMethods).toHaveLength(1);
    expect(detail?.paymentMethods[0]).toMatchObject({
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
      isDefault: true,
      named: true,
    });
    // A credential token is not a transaction id. It is what an off-session
    // charge is made against, and no operator has a use for one.
    expect(Object.keys(detail?.paymentMethods[0] ?? {})).not.toContain(
      "externalId",
    );
    expect(JSON.stringify(detail)).not.toContain("pm_stripe_secret_token");
  });

  test("it keeps a detached or invalid credential on the page", async () => {
    const subscription = await insertSubscription(testDb);
    const invalidAt = new Date();
    await insertPaymentMethod(testDb, {
      last4: "0341",
      invalidAt,
      invalidReason: "expired_card",
      detachedAt: new Date(),
    });

    const detail = await getSubscription(subscription.id);

    // The card the failing renewals were presented against is usually the one
    // the customer has since removed.
    expect(detail?.paymentMethods[0]).toMatchObject({
      last4: "0341",
      invalidReason: "expired_card",
    });
    expect(detail?.paymentMethods[0]?.invalidAt).toEqual(invalidAt);
    expect(detail?.paymentMethods[0]?.detachedAt).toBeInstanceOf(Date);
  });

  test("it renders a subscription whose subject has been destroyed", async () => {
    const subscription = await insertSubscription(testDb, {
      subjectId: "kvm_gone_0000000000000000",
      status: "ended",
      endedAt: new Date(),
    });

    const detail = await getSubscription(subscription.id);

    // `subjectId` is deliberately not a foreign key: billing history has to
    // outlive the machine. A missing name must not 404 the page.
    expect(detail?.subjectName).toBeNull();
    expect(detail?.subjectId).toBe("kvm_gone_0000000000000000");
  });
});
