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

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { eq } from "@virtbase/db";
import { touchLastSeen } from "@virtbase/db/queries";
import * as schema from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { mockSession, seedServerGraph } from "../../../testing/fixtures";
import { isEligibleForInactivityDeletion } from "../eligibility";

let db: TestDb;
let findInactivityCandidates: typeof import("../sweep").findInactivityCandidates;
let scheduleInactivityDeletion: typeof import("../sweep").scheduleInactivityDeletion;
let findAccountsToRemind: typeof import("../sweep").findAccountsToRemind;

const LONG_AGO = new Date("2024-01-01T00:00:00.000Z");

/** The account that owns a server, from `seedServerGraph`. */
const WITH_SERVER = mockSession.user.id;
const DORMANT = "usr_dormant";
const ANNUAL = "usr_annual_unpaid";

beforeAll(async () => {
  db = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db }));
  ({
    findInactivityCandidates,
    scheduleInactivityDeletion,
    findAccountsToRemind,
  } = await import("../sweep"));

  await seedServerGraph(db);

  await db
    .update(schema.users)
    .set({ lastSeenAt: LONG_AGO })
    .where(eq(schema.users.id, WITH_SERVER));

  await db.insert(schema.users).values([
    {
      id: DORMANT,
      name: "Dormant",
      email: "dormant@example.com",
      lastSeenAt: LONG_AGO,
    },
    {
      id: ANNUAL,
      name: "Annual",
      email: "annual@example.com",
      lastSeenAt: LONG_AGO,
    },
  ]);

  await db.insert(schema.invoices).values({
    userId: ANNUAL,
    lexwareInvoiceId: "cccccccc-0000-4000-8000-000000000001",
    number: "RE-ANNUAL",
    total: 1000,
    taxAmount: 190,
    reverseCharge: false,
  });
});

afterAll(async () => {
  await db.$client.close();
});

describe("findInactivityCandidates", () => {
  test("it gathers the facts the rule needs, per account", async () => {
    const candidates = await findInactivityCandidates();
    const byId = new Map(candidates.map((c) => [c.userId, c]));

    expect(byId.get(WITH_SERVER)?.activity.servers).toBe(1);
    expect(byId.get(ANNUAL)?.activity.unpaidInvoices).toBe(1);
    expect(byId.get(DORMANT)?.activity.servers).toBe(0);
    expect(byId.get(DORMANT)?.activity.unpaidInvoices).toBe(0);
  });

  test("only the genuinely abandoned account survives the rule", async () => {
    // The two decoys are the ones that matter: a customer with a live server
    // and one with an open invoice both look dormant by last-seen alone.
    const candidates = await findInactivityCandidates();
    const eligible = candidates.filter(
      (c) => isEligibleForInactivityDeletion(c.activity).eligible,
    );

    expect(eligible.map((c) => c.userId)).toEqual([DORMANT]);
  });

  test("a recently active account is not even a candidate", async () => {
    await db
      .update(schema.users)
      .set({ lastSeenAt: new Date() })
      .where(eq(schema.users.id, DORMANT));

    const candidates = await findInactivityCandidates();
    expect(candidates.map((c) => c.userId)).not.toContain(DORMANT);

    await db
      .update(schema.users)
      .set({ lastSeenAt: LONG_AGO })
      .where(eq(schema.users.id, DORMANT));
  });
});

describe("scheduleInactivityDeletion", () => {
  test("notice and schedule are written together", async () => {
    // A scheduled deletion nobody was told about is the one outcome this
    // feature must never produce, so the two stamps share a statement.
    await scheduleInactivityDeletion(DORMANT);

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, DORMANT));

    expect(user?.deletionReason).toBe("inactivity");
    expect(user?.deletionNotifiedAt).toBeDate();
    expect(user?.deletionScheduledAt).toBeDate();
  });

  test("a scheduled account is not picked up again", async () => {
    const candidates = await findInactivityCandidates();

    expect(candidates.map((c) => c.userId)).not.toContain(DORMANT);
  });

  test("it becomes due for a reminder as the deadline approaches", async () => {
    await db
      .update(schema.users)
      .set({ deletionScheduledAt: new Date(Date.now() + 86_400_000) })
      .where(eq(schema.users.id, DORMANT));

    const toRemind = await findAccountsToRemind();

    expect(toRemind.map((a) => a.userId)).toContain(DORMANT);
  });
});

describe("touchLastSeen", () => {
  test("using the account calls off an inactivity deletion", async () => {
    await touchLastSeen(db as never, DORMANT);

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, DORMANT));

    expect(user?.deletionScheduledAt).toBeNull();
    expect(user?.deletionReason).toBeNull();
    expect(user?.lastSeenAt).toBeDate();
  });

  test("it does NOT call off a deletion the customer asked for", async () => {
    // Signing in to download your data before the deadline is not changing
    // your mind - and if activity cancelled it, anyone holding a session could
    // defer a deletion they are not allowed to stop.
    const scheduledAt = new Date(Date.now() + 86_400_000);
    await db
      .update(schema.users)
      .set({
        deletionReason: "user_request",
        deletionScheduledAt: scheduledAt,
        lastSeenAt: LONG_AGO,
      })
      .where(eq(schema.users.id, DORMANT));

    await touchLastSeen(db as never, DORMANT);

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, DORMANT));

    expect(user?.deletionReason).toBe("user_request");
    expect(user?.deletionScheduledAt).toBeDate();
  });

  test("it leaves an account mid-offboarding alone", async () => {
    await db
      .update(schema.users)
      .set({ offboardingStartedAt: new Date(), lastSeenAt: LONG_AGO })
      .where(eq(schema.users.id, DORMANT));

    await touchLastSeen(db as never, DORMANT);

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, DORMANT));

    expect(user?.lastSeenAt).toEqual(LONG_AGO);
  });
});
