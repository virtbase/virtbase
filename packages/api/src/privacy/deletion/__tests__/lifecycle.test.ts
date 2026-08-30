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

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "@virtbase/db";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { ACCOUNT_DELETION_GRACE_PERIOD_DAYS } from "@virtbase/utils";
import { mockSession, seedServerGraph } from "../../../testing/fixtures";
import { getDeletionBlockers, hasBlockers } from "../blockers";
import {
  cancelAccountDeletion,
  confirmAccountDeletion,
  requestAccountDeletion,
} from "../lifecycle";
import { hashDeletionToken } from "../tokens";

let testDb: TestDb;
const USER_ID = mockSession.user.id;

const db = () => testDb as never;

const userRow = async () =>
  testDb
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, USER_ID))
    .then(([row]) => row);

beforeAll(async () => {
  testDb = await createTestDb();
  await seedServerGraph(testDb);
});

afterAll(async () => {
  await testDb.$client.close();
});

describe("requestAccountDeletion", () => {
  test("asking does not schedule anything on its own", async () => {
    // A session alone is what an attacker who borrowed a laptop already has.
    // Nothing is queued until the mailbox answers.
    const { token } = await requestAccountDeletion({
      db: db(),
      userId: USER_ID,
    });

    expect(token).toBeString();

    const user = await userRow();
    expect(user?.deletionRequestedAt).toBeDate();
    expect(user?.deletionScheduledAt).toBeNull();
  });

  test("only the hash is stored, never the token", async () => {
    const [row] = await testDb
      .select()
      .from(schema.accountDeletionTokens)
      .where(eq(schema.accountDeletionTokens.userId, USER_ID));

    expect(row?.tokenHash).toBeString();
    expect(JSON.stringify(row)).not.toContain('token":"');
  });

  test("asking again invalidates the previous link", async () => {
    // Otherwise "send it again" leaves two live links behind, and revoking
    // access means revoking an unknown number of them.
    const first = await requestAccountDeletion({ db: db(), userId: USER_ID });
    const second = await requestAccountDeletion({ db: db(), userId: USER_ID });

    const rows = await testDb
      .select({ tokenHash: schema.accountDeletionTokens.tokenHash })
      .from(schema.accountDeletionTokens)
      .where(eq(schema.accountDeletionTokens.userId, USER_ID));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashDeletionToken(second.token));
    expect(rows[0]?.tokenHash).not.toBe(hashDeletionToken(first.token));
  });
});

describe("confirmAccountDeletion", () => {
  test("a valid token starts the grace period", async () => {
    const { token } = await requestAccountDeletion({
      db: db(),
      userId: USER_ID,
    });

    const result = await confirmAccountDeletion({ db: db(), token });

    expect(result?.userId).toBe(USER_ID);

    const user = await userRow();
    expect(user?.deletionConfirmedAt).toBeDate();
    expect(user?.deletionScheduledAt).toBeDate();

    const days = Math.round(
      ((user?.deletionScheduledAt?.getTime() ?? 0) - Date.now()) /
        (24 * 60 * 60 * 1000),
    );
    expect(days).toBe(ACCOUNT_DELETION_GRACE_PERIOD_DAYS);
  });

  test("notice is never missing when a deletion is scheduled", async () => {
    // Notice before action is the whole mechanism; a scheduled row with no
    // notified stamp means somebody was never told.
    const user = await userRow();

    expect(user?.deletionNotifiedAt).toBeDate();
  });

  test("the same token cannot be spent twice", async () => {
    const { token } = await requestAccountDeletion({
      db: db(),
      userId: USER_ID,
    });

    expect(await confirmAccountDeletion({ db: db(), token })).not.toBeNull();
    expect(await confirmAccountDeletion({ db: db(), token })).toBeNull();
  });

  test("an unknown token is refused", async () => {
    expect(
      await confirmAccountDeletion({ db: db(), token: "not-a-real-token" }),
    ).toBeNull();
  });

  test("an expired token is refused", async () => {
    const { token } = await requestAccountDeletion({
      db: db(),
      userId: USER_ID,
    });

    await testDb
      .update(schema.accountDeletionTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.accountDeletionTokens.userId, USER_ID));

    expect(await confirmAccountDeletion({ db: db(), token })).toBeNull();
  });
});

describe("cancelAccountDeletion", () => {
  test("it clears every lifecycle flag", async () => {
    // A cancellation that leaves one stamp behind is a deletion that still
    // happens on schedule.
    const { token } = await requestAccountDeletion({
      db: db(),
      userId: USER_ID,
    });
    await confirmAccountDeletion({ db: db(), token });

    expect(await cancelAccountDeletion({ db: db(), userId: USER_ID })).toBe(
      true,
    );

    const user = await userRow();
    expect(user?.deletionScheduledAt).toBeNull();
    expect(user?.deletionConfirmedAt).toBeNull();
    expect(user?.deletionRequestedAt).toBeNull();
    expect(user?.deletionNotifiedAt).toBeNull();
    expect(user?.deletionReason).toBeNull();
  });

  test("it revokes any outstanding confirmation link", async () => {
    const rows = await testDb
      .select()
      .from(schema.accountDeletionTokens)
      .where(eq(schema.accountDeletionTokens.userId, USER_ID));

    expect(rows).toEqual([]);
  });

  test("it refuses once offboarding has started", async () => {
    // By then there are servers that no longer exist, so there is nothing
    // left to cancel back to.
    await testDb
      .update(schema.users)
      .set({ offboardingStartedAt: new Date() })
      .where(eq(schema.users.id, USER_ID));

    expect(await cancelAccountDeletion({ db: db(), userId: USER_ID })).toBe(
      false,
    );

    await testDb
      .update(schema.users)
      .set({ offboardingStartedAt: null })
      .where(eq(schema.users.id, USER_ID));
  });
});

describe("getDeletionBlockers", () => {
  test("a clean account has nothing in the way", async () => {
    const blockers = await getDeletionBlockers({ db: db(), userId: USER_ID });

    expect(hasBlockers(blockers)).toBe(false);
  });

  test("an unpaid invoice blocks it", async () => {
    // Article 17(3)(e): a debt cannot be pursued against an anonymised record.
    await testDb.insert(schema.invoices).values({
      userId: USER_ID,
      lexwareInvoiceId: "aaaaaaaa-0000-4000-8000-000000000001",
      number: "RE-UNPAID",
      total: 1000,
      taxAmount: 190,
      reverseCharge: false,
    });

    const blockers = await getDeletionBlockers({ db: db(), userId: USER_ID });

    expect(blockers.unpaidInvoices).toBe(1);
    expect(hasBlockers(blockers)).toBe(true);
  });

  test("a paid invoice does not", async () => {
    await testDb
      .update(schema.invoices)
      .set({ paidAt: new Date() })
      .where(eq(schema.invoices.number, "RE-UNPAID"));

    const blockers = await getDeletionBlockers({ db: db(), userId: USER_ID });

    expect(blockers.unpaidInvoices).toBe(0);
  });

  test("an order mid-fulfilment blocks it", async () => {
    await testDb.insert(schema.orders).values({
      id: "ord_open",
      userId: USER_ID,
      type: "new_server",
      status: "fulfilling",
      totalAmount: 1000,
      configuration: {},
    });

    const blockers = await getDeletionBlockers({ db: db(), userId: USER_ID });

    expect(blockers.openOrders).toBe(1);
  });

  test("a fulfilled order does not", async () => {
    await testDb
      .update(schema.orders)
      .set({ status: "fulfilled" })
      .where(eq(schema.orders.id, "ord_open"));

    const blockers = await getDeletionBlockers({ db: db(), userId: USER_ID });

    expect(blockers.openOrders).toBe(0);
  });

  test("owning servers is not a blocker", async () => {
    // It is the point of the request: it means destroy them.
    const owned = await testDb
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.userId, USER_ID));

    expect(owned.length).toBeGreaterThan(0);
    expect(
      hasBlockers(await getDeletionBlockers({ db: db(), userId: USER_ID })),
    ).toBe(false);
  });
});

describe("re-requesting a deletion, behaviourally", () => {
  test("the link from the first request no longer confirms anything", async () => {
    // The same invariant as "asking again invalidates the previous link", read
    // out of behaviour rather than out of a hash comparison. Comparing digests
    // only proves the two are different; what actually matters is that the
    // superseded link is dead, and this is the assertion that says so.
    const first = await requestAccountDeletion({ db: db(), userId: USER_ID });
    const second = await requestAccountDeletion({ db: db(), userId: USER_ID });

    expect(first.token).not.toBe(second.token);
    expect(
      await confirmAccountDeletion({ db: db(), token: first.token }),
    ).toBeNull();

    // ...and the one that replaced it still does, so "invalidated" has not
    // quietly become "broke the feature".
    expect(
      await confirmAccountDeletion({ db: db(), token: second.token }),
    ).not.toBeNull();

    await cancelAccountDeletion({ db: db(), userId: USER_ID });
  });
});
