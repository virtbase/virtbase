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
  test,
} from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { paymentMethods, users } from "../../schema";
import type { TestDb } from "../../test-client";
import { createTestDb } from "../../test-client";

let testDb: TestDb;

const USER_ID = "usr_00000000000000000000000012";
const OTHER_USER_ID = "usr_00000000000000000000000013";

beforeAll(async () => {
  testDb = await createTestDb();
});

afterAll(async () => {
  await testDb.$client.close();
});

beforeEach(async () => {
  // Reverse foreign-key order, so every test starts from the same database.
  await testDb.delete(paymentMethods);
  await testDb.delete(users);

  await testDb.insert(users).values([
    {
      id: USER_ID,
      name: "Default Test",
      email: "default@example.com",
      emailVerified: true,
    },
    {
      id: OTHER_USER_ID,
      name: "Other Customer",
      email: "other@example.com",
      emailVerified: true,
    },
  ] as never);
});

/**
 * `externalId` is unique per provider, so every attached card needs its own -
 * the same reason a real one does.
 */
let nextExternalId = 0;

/**
 * `async` rather than returning the query builder directly: a builder is a
 * thenable, not a promise, and `expect(...).rejects` silently declines to
 * inspect one.
 */
const attach = async (
  overrides: Partial<typeof paymentMethods.$inferInsert> = {},
) => {
  nextExternalId += 1;

  return testDb.insert(paymentMethods).values({
    userId: USER_ID,
    provider: "stripe",
    externalId: `pm_stripe_${nextExternalId}`,
    type: "card",
    brand: "visa",
    last4: "4242",
    ...overrides,
  });
};

const liveDefaults = (userId: string) =>
  testDb
    .select()
    .from(paymentMethods)
    .where(
      and(
        eq(paymentMethods.userId, userId),
        eq(paymentMethods.isDefault, true),
        isNull(paymentMethods.detachedAt),
      ),
    );

/**
 * At most one default credential per customer.
 *
 * "Charge the customer's default card" has to be a question with exactly one
 * answer. Two rows carrying the flag turn it into whatever the planner returns
 * first, and the way that surfaces is a renewal billed to the card the
 * customer replaced months ago — often one they have since closed, so a
 * collection that should have been routine becomes a decline, a dunning
 * ladder, and eventually a suspended server. The customer did everything
 * asked of them and lost the machine anyway.
 *
 * The index is partial on `is_default AND detached_at IS NULL` so that
 * replacing a card stays an ordinary sequence of writes. Without the
 * `detached_at` half, every customer's card history would compete for the one
 * slot; without the `is_default` half, a customer could hold only one card at
 * a time. Both halves are load-bearing, so both are tested.
 */
describe("payment_methods - one default per customer", () => {
  test("rejects a second default for the same customer", async () => {
    await attach({ isDefault: true });

    await expect(attach({ isDefault: true })).rejects.toThrow();

    expect(await liveDefaults(USER_ID)).toHaveLength(1);
  });

  test("allows any number of non-default methods", async () => {
    // A customer may keep a card, a SEPA mandate and last year's card on file.
    // Only one of them can be the default; the index must not object to the
    // rest existing.
    await attach({ isDefault: true });
    await attach({ isDefault: false });
    await attach({ isDefault: false, type: "sepa_debit", brand: null });

    const rows = await testDb
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, USER_ID));

    expect(rows).toHaveLength(3);
    expect(await liveDefaults(USER_ID)).toHaveLength(1);
  });

  test("allows a new default once the old one is detached", async () => {
    // Replacing a card is the single most common thing that happens to this
    // table, and it must not require clearing a flag first or a customer whose
    // card expired hits a constraint violation instead of a saved card.
    await attach({ isDefault: true });

    await testDb
      .update(paymentMethods)
      .set({ detachedAt: new Date() })
      .where(eq(paymentMethods.userId, USER_ID));

    await attach({ isDefault: true, last4: "0042" });

    const rows = await testDb
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, USER_ID));

    // The detached row survives - a receipt that cannot say which card paid
    // is not a receipt.
    expect(rows).toHaveLength(2);

    const live = await liveDefaults(USER_ID);
    expect(live).toHaveLength(1);
    expect(live[0]?.last4).toBe("0042");
  });

  test("keeps two customers' defaults apart", async () => {
    await attach({ isDefault: true });
    await attach({ userId: OTHER_USER_ID, isDefault: true });

    expect(await liveDefaults(USER_ID)).toHaveLength(1);
    expect(await liveDefaults(OTHER_USER_ID)).toHaveLength(1);
  });
});
