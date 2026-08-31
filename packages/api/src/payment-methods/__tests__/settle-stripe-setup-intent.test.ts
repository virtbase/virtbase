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

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "@virtbase/db";
import { paymentMethods, users } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";

const testDb: TestDb = await createTestDb();

const retrieve = mock(async (id: string) => ({
  id,
  type: "card",
  card: { brand: "visa", last4: "4242", exp_month: 4, exp_year: 2031 },
}));

mock.module("@virtbase/db/client", () => ({ db: testDb }));
// Spread the real module and replace only the client. `mock.module` is global
// to the whole test run, so returning a bare object here strips every other
// export - which surfaced as a sibling suite failing to find `default`.
const stripeModule = await import("@virtbase/integration-stripe");
mock.module("@virtbase/integration-stripe", () => ({
  ...stripeModule,
  stripe: { paymentMethods: { retrieve } },
}));

const { handleSetupIntentSucceeded } = await import(
  "../settle-stripe-setup-intent"
);

const USER_ID = "usr_00000000000000000000000040";
/** Somebody else, who owns the credential in the ownership-conflict test. */
const OTHER_USER_ID = "usr_00000000000000000000000043";
const CUSTOMER_ID = "cus_setupintent";

const event = (overrides: Record<string, unknown> = {}) =>
  ({
    data: {
      object: {
        id: "seti_1",
        customer: CUSTOMER_ID,
        payment_method: "pm_stripe_new",
        ...overrides,
      },
    },
  }) as never;

beforeEach(async () => {
  retrieve.mockClear();
  await testDb.delete(paymentMethods);
  await testDb.delete(users);
  await testDb.insert(users).values([
    {
      id: USER_ID,
      name: "Setup Intent",
      email: "setup@example.com",
      emailVerified: true,
      stripeCustomerId: CUSTOMER_ID,
    },
    {
      id: OTHER_USER_ID,
      name: "Somebody Else",
      email: "somebody-else@example.com",
      emailVerified: true,
      stripeCustomerId: "cus_somebody_else_seti",
    },
  ] as never);
});

/**
 * The half of "add a payment method" that lives outside the browser.
 *
 * Confirmation happens at Stripe, so this handler is the only moment the
 * application learns a credential exists. Without it the account page saves a
 * card that never appears in the list and automatic renewal has nothing to
 * charge - the feature looks built and does nothing.
 */
describe("handleSetupIntentSucceeded", () => {
  test("records the credential the customer just saved", async () => {
    await handleSetupIntentSucceeded(event());

    const [row] = await testDb
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, USER_ID));

    expect(row?.externalId).toBe("pm_stripe_new");
    expect(row?.provider).toBe("stripe");
    expect(row?.brand).toBe("visa");
    expect(row?.last4).toBe("4242");
    expect(row?.expMonth).toBe(4);
    expect(row?.expYear).toBe(2031);
  });

  test("the customer's first card becomes the one renewals charge", async () => {
    await handleSetupIntentSucceeded(event());

    const [row] = await testDb.select().from(paymentMethods);
    expect(row?.isDefault).toBe(true);
  });

  test("a redelivered event does not mint a second card", async () => {
    // Stripe retries, and it retries the same event. `(provider, external_id)`
    // is what makes the second delivery a no-op rather than a duplicate the
    // customer has to look at and choose between.
    await handleSetupIntentSucceeded(event());
    await handleSetupIntentSucceeded(event());

    expect(await testDb.$count(paymentMethods)).toBe(1);
  });

  test("an intent naming a customer we do not know is ignored, not retried", async () => {
    // Throwing would make the route answer 500 and Stripe redeliver until it
    // gives up, burying the events that matter. An unattributable saved card
    // is inert - unlike an unattributable payment, which is money.
    await handleSetupIntentSucceeded(event({ customer: "cus_stranger" }));

    expect(await testDb.$count(paymentMethods)).toBe(0);
    expect(retrieve).not.toHaveBeenCalled();
  });

  test("an intent with no payment method attached is ignored", async () => {
    await handleSetupIntentSucceeded(event({ payment_method: null }));

    expect(await testDb.$count(paymentMethods)).toBe(0);
    expect(retrieve).not.toHaveBeenCalled();
  });

  test("a credential already held by another customer is not retried", async () => {
    // Both handlers share `recordStripePaymentMethod` precisely so that they
    // cannot answer the same permanent failure differently: one of them
    // throwing is enough to have Stripe redeliver for days and walk the
    // endpoint toward being disabled, which would take `payment_intent.
    // succeeded` and the whole of billing with it.
    await testDb.insert(paymentMethods).values({
      userId: OTHER_USER_ID,
      provider: "stripe",
      externalId: "pm_stripe_new",
      type: "card",
    } as never);

    await handleSetupIntentSucceeded(event());

    const [row] = await testDb.select().from(paymentMethods);
    expect(row?.userId).toBe(OTHER_USER_ID);
    expect(await testDb.$count(paymentMethods)).toBe(1);
  });
});
