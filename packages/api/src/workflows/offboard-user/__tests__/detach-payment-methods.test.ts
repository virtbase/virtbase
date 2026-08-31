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
  spyOn,
  test,
} from "bun:test";
import { eq } from "@virtbase/db";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { integrations } from "../../../integrations";
import {
  mockServerPlanPrice,
  mockSession,
  seedServerGraph,
} from "../../../testing/fixtures";

let db: TestDb;
let detachPaymentMethods: typeof import("../detach-payment-methods").detachPaymentMethodsStep;

const USER_ID = mockSession.user.id;
const OTHER_ID = "usr_0000000000000000000000009";
const TOKEN = "pm_external_live_token";

/** What the provider was asked to release, in the order it was asked. */
let detached: string[] = [];
/** How many rows were still in `payment_methods` at each detach call. */
let rowsAtDetach: number[] = [];

/**
 * Answers only `payment`, so the DNS lookups elsewhere in an offboarding keep
 * getting nothing the way they do on a database with no integrations
 * configured.
 */
const resolveProvider = (
  detachPaymentMethod: (externalId: string) => Promise<void>,
) =>
  spyOn(integrations, "resolve").mockImplementation((async (
    capability: string,
  ) => (capability === "payment" ? { detachPaymentMethod } : null)) as never);

/** Records the call, and what the database still looked like during it. */
const workingProvider = async (externalId: string) => {
  detached.push(externalId);
  rowsAtDetach.push(await db.$count(schema.paymentMethods));
};

const seedCard = async (
  userId: string,
  values: Partial<typeof schema.paymentMethods.$inferInsert> = {},
) => {
  await db.insert(schema.paymentMethods).values({
    id: `pm-${userId}`,
    userId,
    provider: "stripe",
    externalId: `${TOKEN}-${userId}`,
    type: "card",
    brand: "visa",
    last4: "4242",
    isDefault: true,
    ...values,
  });
};

const seedSubscription = async (userId: string) => {
  await db.insert(schema.subscriptions).values({
    id: `sub-${userId}`,
    userId,
    subjectId: `srv-${userId}`,
    serverPlanPriceId: mockServerPlanPrice.id,
    paymentMethodId: `pm-${userId}`,
    currentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
  });
};

const cardsOf = (userId: string) =>
  db
    .select({
      id: schema.paymentMethods.id,
      detachedAt: schema.paymentMethods.detachedAt,
    })
    .from(schema.paymentMethods)
    .where(eq(schema.paymentMethods.userId, userId));

beforeAll(async () => {
  db = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db }));

  detachPaymentMethods = (await import("../detach-payment-methods"))
    .detachPaymentMethodsStep;

  await seedServerGraph(db);
  await db.insert(schema.users).values({
    id: OTHER_ID,
    email: "bystander@example.com",
    name: "Somebody Else",
    role: "CUSTOMER",
  });
});

beforeEach(async () => {
  detached = [];
  rowsAtDetach = [];
  await db.delete(schema.subscriptions);
  await db.delete(schema.paymentMethods);
  resolveProvider(workingProvider);
});

afterAll(async () => {
  await db.$client.close();
});

describe("detachPaymentMethodsStep", () => {
  test("it detaches at the provider before it deletes the row", async () => {
    // The reason this step exists. Our row is a pointer; the credential lives
    // at the provider, so a delete that runs first leaves a card that can
    // still be charged for an account that no longer exists.
    await seedCard(USER_ID);

    const result = await detachPaymentMethods({ userId: USER_ID });

    expect(detached).toEqual([`${TOKEN}-${USER_ID}`]);
    // The row was still there while the provider was being asked, which is
    // what "detach first" means and what an assertion on the end state alone
    // could not tell apart from "delete first".
    expect(rowsAtDetach).toEqual([1]);
    expect(result.paymentMethods).toBe(1);
    expect(await cardsOf(USER_ID)).toEqual([]);
  });

  test("a provider that refuses leaves the credential exactly where it was", async () => {
    // The failure the step must not paper over: if the token is still live at
    // the provider, the row saying so has to stay too. Deleting it anyway
    // would leave a chargeable card nobody can see, in an account nobody can
    // find.
    await seedCard(USER_ID);
    resolveProvider(async () => {
      throw new Error("stripe is having a bad day");
    });

    await expect(detachPaymentMethods({ userId: USER_ID })).rejects.toThrow(
      /bad day/,
    );

    const [card] = await cardsOf(USER_ID);
    expect(card?.id).toBe(`pm-${USER_ID}`);
    // Still live, so the retry knows to ask the provider again.
    expect(card?.detachedAt).toBeNull();
  });

  test("a provider that cannot detach at all fails rather than deleting", async () => {
    // A disabled integration is a configuration problem, and the erasure
    // stopping loudly is the correct outcome of one. Silently dropping the row
    // would report an erasure that did not happen.
    await seedCard(USER_ID);
    spyOn(integrations, "resolve").mockResolvedValue(null as never);

    await expect(detachPaymentMethods({ userId: USER_ID })).rejects.toThrow(
      /not installed or not enabled/,
    );

    expect(await cardsOf(USER_ID)).toHaveLength(1);
  });

  test("a credential the provider has already released is not asked for twice", async () => {
    // What makes a retry safe. The step marks each row the moment its detach
    // returns, so a run that died halfway does not come back and ask the
    // provider to release something it let go on the previous attempt - which
    // is an error at Stripe, and would wedge the offboarding for good.
    await seedCard(USER_ID, {
      isDefault: false,
      detachedAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const result = await detachPaymentMethods({ userId: USER_ID });

    expect(detached).toEqual([]);
    expect(result.detachedPaymentMethods).toBe(0);
    // The row still goes: it is the record that is being erased here, not the
    // credential, which is already gone.
    expect(result.paymentMethods).toBe(1);
    expect(await cardsOf(USER_ID)).toEqual([]);
  });

  test("a subscription pointing at the card keeps everything but the pointer", async () => {
    // `subscriptions.payment_method_id` references `(id, user_id)` with no
    // `onDelete`, so without this the delete is a foreign key violation - and
    // `subscriptions` is `retain`, so the row itself has to survive.
    await seedCard(USER_ID);
    await seedSubscription(USER_ID);

    const result = await detachPaymentMethods({ userId: USER_ID });

    expect(result.unpointedSubscriptions).toBe(1);

    const subscription = await db
      .select({
        id: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
        paymentMethodId: schema.subscriptions.paymentMethodId,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, USER_ID))
      .then(([row]) => row);

    expect(subscription?.paymentMethodId).toBeNull();
    // Only the pointer was nulled. `user_id` is the other half of the same
    // composite key, and losing it would detach the agreement from the person
    // it was made with.
    expect(subscription?.userId).toBe(USER_ID);
  });

  test("it does not reach past the account being erased", async () => {
    await seedCard(USER_ID);
    await seedCard(OTHER_ID);
    await seedSubscription(OTHER_ID);

    const result = await detachPaymentMethods({ userId: USER_ID });

    expect(result.paymentMethods).toBe(1);
    expect(detached).toEqual([`${TOKEN}-${USER_ID}`]);
    expect(await cardsOf(OTHER_ID)).toHaveLength(1);

    const bystander = await db
      .select({ paymentMethodId: schema.subscriptions.paymentMethodId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, OTHER_ID))
      .then(([row]) => row);

    expect(bystander?.paymentMethodId).toBe(`pm-${OTHER_ID}`);
  });

  test("an account with no saved credential is not a special case", async () => {
    const result = await detachPaymentMethods({ userId: USER_ID });

    expect(result).toEqual({
      paymentMethods: 0,
      detachedPaymentMethods: 0,
      unpointedSubscriptions: 0,
    });
    expect(detached).toEqual([]);
  });
});
