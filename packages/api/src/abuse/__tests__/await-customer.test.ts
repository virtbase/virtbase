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
import { abuseCases, users } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";

const dispatched: { key: string; params: Record<string, unknown> }[] = [];
mock.module("../../notifications/dispatch", () => ({
  dispatchNotification: async (input: {
    key: string;
    params: Record<string, unknown>;
  }) => {
    dispatched.push({ key: input.key, params: input.params });
    return { created: 1, deduplicated: 0, delivered: 1, skipped: 0, failed: 0 };
  },
}));

import { mockSession } from "../../testing";
import { awaitCustomerResponse, DEFAULT_RESPONSE_HOURS } from "../case";

let testDb: TestDb;

const openCase = (overrides: Record<string, unknown> = {}) =>
  testDb
    .insert(abuseCases)
    .values({
      userId: mockSession.user.id,
      category: "port_scan",
      severity: "high",
      status: "triage",
      title: "Port scanning",
      ...overrides,
    } as never)
    .returning({ id: abuseCases.id })
    .then(([row]) => row?.id as string);

const read = (id: string) =>
  testDb
    .select()
    .from(abuseCases)
    .where(eq(abuseCases.id, id))
    .limit(1)
    .then(([row]) => row);

beforeEach(async () => {
  dispatched.length = 0;
  testDb = await createTestDb();
  await testDb.insert(users).values(mockSession.user);
});

describe("awaitCustomerResponse", () => {
  /**
   * A regression.
   *
   * Moving a case to `awaiting_customer` used to write the status and nothing
   * else. `reconcileAbuseCases` selects on `respond_by <= now()`, and NULL is
   * never `<=` anything, so every hand-over an operator made by hand produced
   * a case that would wait forever - while the notice told the customer they
   * had 24 hours.
   */
  test("writes a deadline the escalation sweep can actually see", async () => {
    const id = await openCase();

    expect(
      await awaitCustomerResponse({ db: testDb as never, caseId: id }),
    ).toEqual({ handed: true });

    const row = await read(id);
    expect(row?.status).toBe("awaiting_customer");

    const respondBy = row?.respondBy;
    expect(respondBy).toBeInstanceOf(Date);

    const hours = ((respondBy as Date).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(DEFAULT_RESPONSE_HOURS - 1);
    expect(hours).toBeLessThan(DEFAULT_RESPONSE_HOURS + 1);
  });

  test("tells the customer, with the case's real category", async () => {
    // The notice used to hardcode `other`, so every customer was told their
    // case was about something it was not.
    const id = await openCase({ category: "port_scan" });
    await awaitCustomerResponse({ db: testDb as never, caseId: id });

    const notice = dispatched.find((d) => "abuse.case.notice" === d.key);
    expect(notice).toBeDefined();
    expect(notice?.params.category).toBe("port_scan");
    expect(notice?.params.deadlineHours).toBe(DEFAULT_RESPONSE_HOURS);
  });

  test("a new deadline is a new chance to miss one", async () => {
    // `escalated_at` stops one overdue case escalating every five minutes. It
    // must not stop the ladder after the customer answers and goes quiet again.
    const id = await openCase({
      status: "awaiting_customer",
      escalatedAt: new Date(),
      enforcement: "throttle",
    });

    await awaitCustomerResponse({ db: testDb as never, caseId: id });

    expect((await read(id))?.escalatedAt).toBeNull();
  });

  test("refuses a case with nobody to ask", async () => {
    // A mailbox case still in triage. Starting a clock against no one would
    // escalate enforcement over a silence nobody was asked to break.
    const id = await openCase({ userId: null });

    expect(
      await awaitCustomerResponse({ db: testDb as never, caseId: id }),
    ).toEqual({ handed: false, reason: "no_customer" });
    expect((await read(id))?.respondBy).toBeNull();
    expect(dispatched).toHaveLength(0);
  });

  test("never hands a settled case back", async () => {
    // Found in review. `releaseCase` clears the per-server lock rows and
    // leaves `abuse_cases.enforcement` alone, so a resolved case still carries
    // its last level. Setting a live deadline on one would have the escalation
    // sweep re-lock the customer a day later, one rung *above* what was
    // released, on a case both sides considered finished.
    for (const status of ["resolved", "rejected"] as const) {
      const id = await openCase({
        status,
        enforcement: "throttle",
        closedAt: new Date(),
        resolution: "fixed_by_customer",
      });

      expect(
        await awaitCustomerResponse({ db: testDb as never, caseId: id }),
      ).toEqual({ handed: false, reason: "settled" });

      const row = await read(id);
      expect(row?.status).toBe(status);
      expect(row?.respondBy).toBeNull();
      expect(dispatched).toHaveLength(0);
    }
  });
});
