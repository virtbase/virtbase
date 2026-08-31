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
import { eq } from "@virtbase/db";
import { paymentMethods, users } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { mockSession } from "../../testing";
import { listPaymentMethods } from "../list";
import {
  PaymentMethodOwnershipConflictError,
  recordPaymentMethod,
} from "../record";

const USER_A = mockSession.user.id;
const USER_B = "usr_0000000000000000000000001";

let db: TestDb;

const record = (
  overrides: Partial<Parameters<typeof recordPaymentMethod>[0]> = {},
) =>
  recordPaymentMethod({
    // PGlite in the tests, Neon in production - structurally the same drizzle
    // surface, different query-result type. Cast the way the other domain
    // tests do rather than widening the production signature for them.
    db: db as never,
    userId: USER_A,
    provider: "stripe",
    externalId: "pm_stripe_1",
    type: "card",
    brand: "visa",
    last4: "4242",
    expMonth: 12,
    expYear: 2030,
    ...overrides,
  });

const readRow = (id: string) =>
  db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.id, id))
    .limit(1)
    .then(([row]) => row ?? null);

beforeAll(async () => {
  db = await createTestDb();

  await db
    .insert(users)
    .values([
      mockSession.user,
      {
        ...mockSession.user,
        id: USER_B,
        email: "other@example.com",
        name: "Other User",
      },
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.$client.close();
});

afterEach(async () => {
  await db.delete(paymentMethods);
});

describe("recordPaymentMethod", () => {
  test("a customer's first credential becomes their default", async () => {
    const recorded = await record();

    expect(recorded.id).toStartWith("pm_");
    expect(recorded.isDefault).toBe(true);
    expect(recorded.brand).toBe("visa");
    expect(recorded.last4).toBe("4242");
  });

  test("a second credential does not displace the first", async () => {
    const first = await record({ externalId: "pm_stripe_1" });
    const second = await record({ externalId: "pm_stripe_2" });

    expect(second.isDefault).toBe(false);
    expect((await readRow(first.id))?.isDefault).toBe(true);
  });

  test("it upserts on (provider, external_id) rather than minting a twin", async () => {
    const first = await record({ last4: "4242" });
    const again = await record({ last4: "1111", brand: "mastercard" });

    expect(again.id).toBe(first.id);
    expect(again.last4).toBe("1111");
    expect(again.brand).toBe("mastercard");

    const all = await db.select().from(paymentMethods);
    expect(all).toHaveLength(1);
  });

  test("re-saving the current default keeps it the default", async () => {
    await record();
    const again = await record();

    expect(again.isDefault).toBe(true);
  });

  test("re-attaching a removed credential does not collide with the new default", async () => {
    // The exact shape that used to break: the old row still carries a default
    // flag from before it was detached, and un-detaching it without
    // recomputing puts two live defaults on one customer, which the partial
    // unique index refuses.
    const first = await record({ externalId: "pm_stripe_1" });
    await db
      .update(paymentMethods)
      .set({ detachedAt: new Date(), isDefault: true })
      .where(eq(paymentMethods.id, first.id));

    const replacement = await record({ externalId: "pm_stripe_2" });
    expect(replacement.isDefault).toBe(true);

    const reattached = await record({ externalId: "pm_stripe_1" });

    expect(reattached.id).toBe(first.id);
    expect(reattached.isDefault).toBe(false);
    expect((await readRow(first.id))?.detachedAt).toBeNull();
  });

  test("it clears a previous invalid marking", async () => {
    const first = await record();
    await db
      .update(paymentMethods)
      .set({ invalidAt: new Date(), invalidReason: "expired_card" })
      .where(eq(paymentMethods.id, first.id));

    const again = await record();

    expect(again.invalidAt).toBeNull();
    expect(again.invalidReason).toBeNull();
  });

  test("it refuses to move a credential between customers", async () => {
    const mine = await record({ userId: USER_A });

    await expect(record({ userId: USER_B })).rejects.toThrow(
      PaymentMethodOwnershipConflictError,
    );

    expect((await readRow(mine.id))?.userId).toBe(USER_A);
  });

  test("what it writes is what the customer's list shows", async () => {
    await record({ externalId: "pm_stripe_1" });
    await record({ externalId: "pm_stripe_2", last4: "1111" });

    const listed = await listPaymentMethods({
      db: db as never,
      userId: USER_A,
    });

    expect(listed).toHaveLength(2);
    expect(listed[0]?.isDefault).toBe(true);
    expect(
      await listPaymentMethods({ db: db as never, userId: USER_B }),
    ).toEqual([]);
  });
});
