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

mock.module("@virtbase/db/client", () => ({ db: testDb }));

/**
 * The seam for "the write failed for a reason that is not permanent".
 *
 * A transient failure has no shape a fixture can produce - the database is
 * simply gone for a moment - so it is injected. The real module is spread and
 * the replacement delegates to it whenever nothing is armed, because
 * `mock.module` is global to the whole test run: a bare object here would
 * strip `PaymentMethodOwnershipConflictError` out from under `record.test.ts`.
 */
const realRecord = { ...(await import("../record")) };

let armedRecordFailure: Error | null = null;

mock.module("../record", () => ({
  ...realRecord,
  recordPaymentMethod: async (
    input: Parameters<typeof realRecord.recordPaymentMethod>[0],
  ) => {
    const failure = armedRecordFailure;
    armedRecordFailure = null;

    if (failure) throw failure;

    // The captured function, never `namespace.recordPaymentMethod` - the
    // module namespace is what was just replaced, so reading it back here is
    // an infinite recursion that takes `record.test.ts` down with it.
    return realRecord.recordPaymentMethod(input);
  },
}));

const { handlePaymentMethodAttached, handlePaymentMethodDetached } =
  await import("../settle-stripe-payment-method");

const USER_ID = "usr_00000000000000000000000041";
/** Somebody else, who owns the credential in the ownership-conflict test. */
const OTHER_USER_ID = "usr_00000000000000000000000042";
const CUSTOMER_ID = "cus_attached";

/**
 * `payment_method.attached` sends the PaymentMethod itself, which is the whole
 * reason the handler needs no Stripe client: the customer and every field the
 * customer will see are already here.
 */
const attached = (overrides: Record<string, unknown> = {}) =>
  ({
    type: "payment_method.attached",
    data: {
      object: {
        id: "pm_from_checkout",
        object: "payment_method",
        type: "card",
        customer: CUSTOMER_ID,
        card: {
          brand: "mastercard",
          last4: "4444",
          exp_month: 7,
          exp_year: 2032,
        },
        ...overrides,
      },
    },
  }) as never;

const detached = (id: string) =>
  ({
    type: "payment_method.detached",
    data: {
      object: {
        id,
        object: "payment_method",
        type: "card",
        // Stripe clears the customer on the object it sends with this event,
        // which is why attribution cannot go through it.
        customer: null,
        card: { brand: "visa", last4: "4242", exp_month: 4, exp_year: 2031 },
      },
    },
  }) as never;

const rows = () => testDb.select().from(paymentMethods);

beforeEach(async () => {
  armedRecordFailure = null;
  await testDb.delete(paymentMethods);
  await testDb.delete(users);
  await testDb.insert(users).values([
    {
      id: USER_ID,
      name: "Checkout Saver",
      email: "checkout@example.com",
      emailVerified: true,
      stripeCustomerId: CUSTOMER_ID,
    },
    {
      id: OTHER_USER_ID,
      name: "Somebody Else",
      email: "somebody@example.com",
      emailVerified: true,
      stripeCustomerId: "cus_somebody_else",
    },
  ] as never);
});

/**
 * The path a card actually arrives on.
 *
 * Checkout creates its customer session with `payment_method_save`, so a card
 * the customer ticks "save" on is saved off the payment intent: Stripe
 * attaches it and fires this, and no setup intent is ever created. Listening
 * only for `setup_intent.succeeded` meant the billing page told a customer
 * with a perfectly good card at Stripe that they had none.
 */
describe("handlePaymentMethodAttached", () => {
  test("records the card the customer saved at checkout", async () => {
    await handlePaymentMethodAttached(attached());

    const [row] = await testDb
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, USER_ID));

    expect(row?.externalId).toBe("pm_from_checkout");
    expect(row?.provider).toBe("stripe");
    expect(row?.type).toBe("card");
    expect(row?.brand).toBe("mastercard");
    expect(row?.last4).toBe("4444");
    expect(row?.expMonth).toBe(7);
    expect(row?.expYear).toBe(2032);
  });

  test("describes a SEPA mandate without inventing an expiry", async () => {
    await handlePaymentMethodAttached(
      attached({
        id: "pm_sepa",
        type: "sepa_debit",
        card: undefined,
        sepa_debit: { bank_code: "37040044", last4: "3000" },
      }),
    );

    const [row] = await rows();

    expect(row?.type).toBe("sepa_debit");
    expect(row?.brand).toBe("37040044");
    expect(row?.last4).toBe("3000");
    // A mandate has no expiry, and a dunning mail must not claim one did.
    expect(row?.expMonth).toBeNull();
    expect(row?.expYear).toBeNull();
  });

  test("the customer's first card becomes the one renewals charge", async () => {
    await handlePaymentMethodAttached(attached());

    const [row] = await rows();
    expect(row?.isDefault).toBe(true);
  });

  test("a second card does not displace the first as default", async () => {
    // Changing where the money comes from is an explicit act, not a side
    // effect of saving another card.
    await handlePaymentMethodAttached(attached());
    await handlePaymentMethodAttached(attached({ id: "pm_second" }));

    const defaults = await testDb
      .select({ externalId: paymentMethods.externalId })
      .from(paymentMethods)
      .where(eq(paymentMethods.isDefault, true));

    expect(defaults).toEqual([{ externalId: "pm_from_checkout" }]);
  });

  test("a redelivered event does not mint a second card", async () => {
    // Stripe retries, and it retries the same event. `(provider, external_id)`
    // is what makes the second delivery a no-op rather than a duplicate the
    // customer has to look at and choose between.
    await handlePaymentMethodAttached(attached());
    await handlePaymentMethodAttached(attached());

    expect(await testDb.$count(paymentMethods)).toBe(1);
  });

  test("an event naming a customer we do not know is ignored, not retried", async () => {
    // Throwing would make the route answer 500 and Stripe redeliver until it
    // gives up, burying the events that matter. An unattributable saved card
    // is inert - unlike an unattributable payment, which is money.
    await handlePaymentMethodAttached(attached({ customer: "cus_stranger" }));

    expect(await testDb.$count(paymentMethods)).toBe(0);
  });

  test("an attach with no customer at all is ignored", async () => {
    await handlePaymentMethodAttached(attached({ customer: null }));

    expect(await testDb.$count(paymentMethods)).toBe(0);
  });

  test("a credential already held by another customer is not retried", async () => {
    // The permanent failure the handler used to let escape. Throwing makes the
    // route answer 500, and Stripe then redelivers on its full backoff for
    // days - burning a Sentry event each time and pushing the endpoint toward
    // the automatic-disable threshold, which would take
    // `payment_intent.succeeded` with it and quietly stop every renewal
    // settlement and every order fulfilment on the platform. No retry can make
    // this recordable: `recordPaymentMethod` refuses to move a credential
    // between customers, and it will refuse the hundredth delivery too.
    await realRecord.recordPaymentMethod({
      db: testDb as never,
      userId: OTHER_USER_ID,
      provider: "stripe",
      externalId: "pm_from_checkout",
      type: "card",
    });

    await handlePaymentMethodAttached(attached());

    const [row] = await rows();
    // Refused, not silently corrected: the row stays where it was.
    expect(row?.userId).toBe(OTHER_USER_ID);
    expect(await testDb.$count(paymentMethods)).toBe(1);
  });

  test("a failure that a later delivery could get past is still thrown", async () => {
    // The other half of the contract. Swallowing this would lose the
    // customer's saved card silently, and they would find out at a renewal.
    armedRecordFailure = new Error(
      "terminating connection due to administrator command",
    );

    await expect(handlePaymentMethodAttached(attached())).rejects.toThrow(
      "terminating connection due to administrator command",
    );

    expect(await testDb.$count(paymentMethods)).toBe(0);
  });
});

/**
 * A card removed anywhere other than in this application's own UI.
 *
 * `removePaymentMethod` has already done the local half by the time this
 * arrives for a customer's own removal. What it is for is the Stripe
 * dashboard, a deleted customer, an issuer withdrawing a card - after which
 * every off-session charge on the token fails with `resource_missing`.
 */
describe("handlePaymentMethodDetached", () => {
  test("soft-deletes the row and takes the default flag with it", async () => {
    await handlePaymentMethodAttached(attached());

    await handlePaymentMethodDetached(detached("pm_from_checkout"));

    const [row] = await rows();
    expect(row?.detachedAt).toBeInstanceOf(Date);
    // A detached row that kept `is_default` collides with the next default
    // the day the same card is re-attached.
    expect(row?.isDefault).toBe(false);
  });

  test("the row survives, because payments point at it", async () => {
    await handlePaymentMethodAttached(attached());
    await handlePaymentMethodDetached(detached("pm_from_checkout"));

    // A receipt that cannot say which card paid is not a receipt.
    expect(await testDb.$count(paymentMethods)).toBe(1);
  });

  test("it leaves the customer's other card alone", async () => {
    await handlePaymentMethodAttached(attached());
    await handlePaymentMethodAttached(attached({ id: "pm_second" }));

    await handlePaymentMethodDetached(detached("pm_second"));

    const [survivor] = await testDb
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.externalId, "pm_from_checkout"));

    expect(survivor?.detachedAt).toBeNull();
    expect(survivor?.isDefault).toBe(true);
  });

  test("a redelivery does not restamp the moment it happened", async () => {
    await handlePaymentMethodAttached(attached());
    await handlePaymentMethodDetached(detached("pm_from_checkout"));

    const [first] = await rows();
    await handlePaymentMethodDetached(detached("pm_from_checkout"));
    const [second] = await rows();

    expect(second?.detachedAt).toEqual(first?.detachedAt as Date);
  });

  test("a credential we never recorded is ignored", async () => {
    await handlePaymentMethodDetached(detached("pm_never_seen"));

    expect(await testDb.$count(paymentMethods)).toBe(0);
  });
});
