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
  test,
} from "bun:test";
import { asc, eq } from "@virtbase/db";
import { paymentMethods, users } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import type { Stripe } from "@virtbase/integration-stripe";
import {
  backfillPaymentMethods,
  findPaymentMethodBackfillCustomers,
} from "../payment-methods";

let testDb: TestDb;

/** Ids are the paging key, so they are written to sort predictably. */
const userId = (n: number) => `usr_${n.toString().padStart(24, "0")}` as const;

const addUser = async (n: number, stripeCustomerId: string | null) => {
  await testDb.insert(users).values({
    id: userId(n),
    name: `Customer ${n}`,
    email: `customer${n}@example.com`,
    emailVerified: true,
    stripeCustomerId,
  } as never);

  return userId(n);
};

const card = (id: string, last4 = "4242") =>
  ({
    id,
    object: "payment_method",
    type: "card",
    customer: null,
    card: { brand: "visa", last4, exp_month: 4, exp_year: 2031 },
  }) as unknown as Stripe.PaymentMethod;

/** A Stripe account, as a map of customer id to what it holds. */
const provider = (holdings: Record<string, Stripe.PaymentMethod[]>) => {
  const calls: string[] = [];

  return {
    calls,
    list: async (customerId: string) => {
      calls.push(customerId);

      const held = holdings[customerId];
      if (!held) {
        // What Stripe answers for a customer id that no longer exists.
        throw new Error(`No such customer: ${customerId}`);
      }

      return held;
    },
  };
};

const backfill = (
  list: (customerId: string) => Promise<Stripe.PaymentMethod[]>,
  options: Partial<Parameters<typeof backfillPaymentMethods>[0]> = {},
) =>
  backfillPaymentMethods({
    // PGlite in the tests, Neon in production - structurally the same drizzle
    // surface, different query-result type. Cast the way the other domain
    // tests do rather than widening the production signature for them.
    db: testDb as never,
    listPaymentMethods: list,
    ...options,
  });

const rows = () =>
  testDb.select().from(paymentMethods).orderBy(asc(paymentMethods.externalId));

beforeAll(async () => {
  testDb = await createTestDb();
});

afterAll(async () => {
  await testDb.$client.close();
});

afterEach(async () => {
  await testDb.delete(paymentMethods);
  await testDb.delete(users);
});

describe("findPaymentMethodBackfillCustomers", () => {
  test("it takes only the users who have a customer at the provider", async () => {
    await addUser(1, "cus_1");
    await addUser(2, null);

    expect(await findPaymentMethodBackfillCustomers(testDb as never)).toEqual([
      { userId: userId(1), stripeCustomerId: "cus_1" },
    ]);
  });

  test("it pages forward from a cursor", async () => {
    await addUser(1, "cus_1");
    await addUser(2, "cus_2");
    await addUser(3, "cus_3");

    const first = await findPaymentMethodBackfillCustomers(testDb as never, {
      limit: 2,
    });
    const rest = await findPaymentMethodBackfillCustomers(testDb as never, {
      after: first[1]?.userId,
    });

    expect(first.map((c) => c.userId)).toEqual([userId(1), userId(2)]);
    expect(rest.map((c) => c.userId)).toEqual([userId(3)]);
  });
});

describe("backfillPaymentMethods", () => {
  test("a dry run is what you get for free, and it writes nothing", async () => {
    await addUser(1, "cus_1");
    const stripe = provider({ cus_1: [card("pm_a"), card("pm_b", "1111")] });

    const seen: string[] = [];
    const result = await backfill(stripe.list, {
      onCandidate: (candidate) => seen.push(candidate.externalId),
    });

    expect(result.dryRun).toBe(true);
    // The count the safe mode prints is the count the real run will write.
    expect(result).toMatchObject({
      scanned: 1,
      found: 2,
      created: 2,
      skipped: 0,
      failed: 0,
    });
    expect(seen).toEqual(["pm_a", "pm_b"]);
    expect(await rows()).toEqual([]);
    // It still reads from the provider, or the numbers it prints would be a
    // guess.
    expect(stripe.calls).toEqual(["cus_1"]);
  });

  test("it records every credential the provider holds with --apply", async () => {
    await addUser(1, "cus_1");
    const stripe = provider({ cus_1: [card("pm_a"), card("pm_b", "1111")] });

    const result = await backfill(stripe.list, { dryRun: false });

    expect(result).toMatchObject({ scanned: 1, found: 2, created: 2 });

    const recorded = await rows();
    expect(recorded.map((row) => row.externalId)).toEqual(["pm_a", "pm_b"]);
    expect(recorded[0]).toMatchObject({
      userId: userId(1),
      provider: "stripe",
      type: "card",
      brand: "visa",
      last4: "4242",
      expMonth: 4,
      expYear: 2031,
    });
  });

  test("the customer's first card becomes the one renewals charge", async () => {
    await addUser(1, "cus_1");
    // Stripe lists newest first, so the first one recorded is the card the
    // customer saved most recently.
    const stripe = provider({ cus_1: [card("pm_newest"), card("pm_older")] });

    await backfill(stripe.list, { dryRun: false });

    const defaults = (await rows()).filter((row) => row.isDefault);
    expect(defaults.map((row) => row.externalId)).toEqual(["pm_newest"]);
  });

  test("a second run creates nothing", async () => {
    await addUser(1, "cus_1");
    const stripe = provider({ cus_1: [card("pm_a"), card("pm_b", "1111")] });

    await backfill(stripe.list, { dryRun: false });
    const second = await backfill(stripe.list, { dryRun: false });

    expect(second).toMatchObject({ found: 2, created: 0, skipped: 2 });
    expect(await testDb.$count(paymentMethods)).toBe(2);
  });

  test("it leaves a customer's existing default where it is", async () => {
    const id = await addUser(1, "cus_1");
    await testDb.insert(paymentMethods).values({
      userId: id,
      provider: "stripe",
      externalId: "pm_chosen",
      type: "card",
      brand: "visa",
      last4: "0000",
      isDefault: true,
    });

    const stripe = provider({
      cus_1: [card("pm_new"), card("pm_chosen", "0000")],
    });

    await backfill(stripe.list, { dryRun: false });

    const defaults = (await rows()).filter((row) => row.isDefault);
    expect(defaults.map((row) => row.externalId)).toEqual(["pm_chosen"]);
  });

  test("it does not resurrect a card the customer removed", async () => {
    // `recordPaymentMethod` clears `detached_at` and `invalid_at` on purpose,
    // because a provider handing back a working credential has overruled what
    // it said before. A bulk sweep has no such news, which is why an already
    // recorded credential is skipped outright rather than re-recorded.
    const id = await addUser(1, "cus_1");
    const detachedAt = new Date("2026-01-01T00:00:00.000Z");
    await testDb.insert(paymentMethods).values({
      userId: id,
      provider: "stripe",
      externalId: "pm_removed",
      type: "card",
      detachedAt,
      invalidAt: detachedAt,
      invalidReason: "expired_card",
    });

    const result = await backfill(
      provider({ cus_1: [card("pm_removed")] }).list,
      {
        dryRun: false,
      },
    );

    expect(result).toMatchObject({ created: 0, skipped: 1 });

    const [row] = await rows();
    expect(row?.detachedAt).toEqual(detachedAt);
    expect(row?.invalidAt).toEqual(detachedAt);
    expect(row?.invalidReason).toBe("expired_card");
  });

  test("it skips a credential recorded against a different customer", async () => {
    // `(provider, external_id)` is unique across the whole table, so this row
    // is not one this run may claim.
    await addUser(1, "cus_1");
    const other = await addUser(2, null);
    await testDb.insert(paymentMethods).values({
      userId: other,
      provider: "stripe",
      externalId: "pm_theirs",
      type: "card",
    });

    const result = await backfill(
      provider({ cus_1: [card("pm_theirs")] }).list,
      {
        dryRun: false,
      },
    );

    expect(result).toMatchObject({ created: 0, skipped: 1, failed: 0 });
    const [row] = await rows();
    expect(row?.userId).toBe(other);
  });

  test("one customer's failure does not end the run", async () => {
    // A customer object deleted at Stripe while the id is still on the user
    // row. A script that dies on the first of these never reaches the
    // thousands behind it.
    await addUser(1, "cus_gone");
    await addUser(2, "cus_2");
    const stripe = provider({ cus_2: [card("pm_a")] });

    const failures: string[] = [];
    const result = await backfill(stripe.list, {
      dryRun: false,
      onFailure: ({ stripeCustomerId }) => failures.push(stripeCustomerId),
    });

    expect(result).toMatchObject({ scanned: 2, created: 1, failed: 1 });
    expect(failures).toEqual(["cus_gone"]);
    expect((await rows()).map((row) => row.externalId)).toEqual(["pm_a"]);
  });

  test("it stops at --limit and says where to resume", async () => {
    await addUser(1, "cus_1");
    await addUser(2, "cus_2");
    await addUser(3, "cus_3");
    const stripe = provider({
      cus_1: [card("pm_1")],
      cus_2: [card("pm_2")],
      cus_3: [card("pm_3")],
    });

    const first = await backfill(stripe.list, {
      dryRun: false,
      limit: 2,
      batchSize: 1,
    });

    expect(first).toMatchObject({ scanned: 2, created: 2 });
    expect(first.cursor).toBe(userId(2));

    const rest = await backfill(stripe.list, {
      dryRun: false,
      after: first.cursor,
    });

    expect(rest).toMatchObject({ scanned: 1, created: 1 });
    expect((await rows()).map((row) => row.externalId)).toEqual([
      "pm_1",
      "pm_2",
      "pm_3",
    ]);
  });

  test("a user with no customer at the provider is never asked about", async () => {
    await addUser(1, null);
    const stripe = provider({});

    const result = await backfill(stripe.list, { dryRun: false });

    expect(result).toMatchObject({ scanned: 0, found: 0, created: 0 });
    expect(stripe.calls).toEqual([]);
  });

  test("it reports progress per batch", async () => {
    await addUser(1, "cus_1");
    await addUser(2, "cus_2");
    const stripe = provider({ cus_1: [card("pm_1")], cus_2: [card("pm_2")] });

    const batches: number[] = [];
    await backfill(stripe.list, {
      dryRun: false,
      batchSize: 1,
      onProgress: ({ created }) => batches.push(created),
    });

    expect(batches).toEqual([1, 2]);
  });
});

describe("the credential a user sees afterwards", () => {
  test("a backfilled card is the one a renewal would charge", async () => {
    const id = await addUser(1, "cus_1");
    await backfill(provider({ cus_1: [card("pm_a")] }).list, { dryRun: false });

    const [row] = await testDb
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, id));

    // Live, default, and not marked dead - the three things
    // `resolveRenewalPaymentMethod` and the billing page both ask for.
    expect(row?.detachedAt).toBeNull();
    expect(row?.isDefault).toBe(true);
    expect(row?.invalidAt).toBeNull();
  });
});
