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
import { TRPCError } from "@trpc/server";
import type { Session } from "@virtbase/auth";
import { eq } from "@virtbase/db";
import { dataExports, invoices, users } from "@virtbase/db/schema";
import { STEP_UP_WINDOW_SECONDS } from "@virtbase/utils";
import { appRouter } from "../../root";
import type { TestCaller, TestCallerResult } from "../../testing";
import { createTestCaller, mockSession } from "../../testing";

// Neither reaches anything real in a test: the workflow engine would try to
// enqueue a run, and the step-up marker would try to reach Redis.
const started: unknown[] = [];
mock.module("workflow/api", () => ({
  start: async (...args: unknown[]) => {
    started.push(args);
  },
}));
mock.module("@virtbase/email", () => ({
  sendEmail: async () => {},
  sendBatchEmail: async () => {},
}));
mock.module("../../upstash/redis", () => ({
  redis: {
    get: async () => null,
    set: async () => "OK",
    del: async () => 1,
  },
}));

let harness: TestCallerResult;
let testDb: TestCallerResult["db"];
let caller: TestCaller;
let unauthenticatedCaller: TestCaller;
let staleCaller: TestCaller;

/** A session old enough that signing in no longer counts as proving anything. */
const staleSession = {
  ...mockSession,
  session: {
    ...mockSession.session,
    createdAt: new Date(Date.now() - (STEP_UP_WINDOW_SECONDS + 60) * 1000),
  },
} satisfies Session;

beforeAll(async () => {
  harness = await createTestCaller();
  ({ db: testDb, caller, unauthenticatedCaller } = harness);

  // Built over the same database as `caller`, not a second harness: the two
  // must see the same rows for a cancellation by one to be visible to the
  // other.
  staleCaller = appRouter.createCaller({
    db: testDb as never,
    authApi: {} as never,
    apiKey: null,
    headers: harness.headers,
    setHeader: () => {},
    session: staleSession,
  });

  await testDb.insert(users).values(mockSession.user).onConflictDoNothing();
});

afterAll(async () => {
  await harness.close();
});

describe("privacy.requestExport", () => {
  test("it refuses an unauthenticated caller", async () => {
    expect(unauthenticatedCaller.privacy.requestExport()).rejects.toThrow(
      TRPCError,
    );
  });

  test("it refuses a session that has not re-authenticated recently", async () => {
    // The security property: a borrowed session should not be able to produce
    // a complete dossier and mail itself the link.
    expect(staleCaller.privacy.requestExport()).rejects.toThrow(
      /FORBIDDEN|STEP_UP/,
    );
  });

  test("it returns a passphrase exactly once and queues the build", async () => {
    const result = await caller.privacy.requestExport();

    expect(result.exportId).toStartWith("exp_");
    expect(result.passphrase).toBeString();
    expect(result.passphrase.length).toBeGreaterThanOrEqual(16);
    expect(started).toHaveLength(1);

    const [row] = await testDb
      .select({ status: dataExports.status, artifact: dataExports.artifact })
      .from(dataExports)
      .where(eq(dataExports.id, result.exportId));

    expect(row?.status).toBe("pending");
    // The passphrase must not be recoverable from the row it protects.
    expect(JSON.stringify(row)).not.toContain(result.passphrase);
  });

  test("it refuses a second request inside the interval", async () => {
    // Article 12(5): every export costs one call to the accounting provider
    // per invoice, so a repeat request is refused rather than queued.
    expect(caller.privacy.requestExport()).rejects.toThrow(
      /EXPORT_ALREADY_REQUESTED|TOO_MANY_REQUESTS/,
    );
  });
});

describe("privacy.latestExport", () => {
  test("it reports the customer's most recent export", async () => {
    const { export: latest } = await caller.privacy.latestExport();

    expect(latest?.status).toBe("pending");
    expect(latest?.expires_at).toBeDate();
  });

  test("it never returns the artifact bytes", async () => {
    // A multi-megabyte dossier has no business travelling through a polling
    // query; the download route serves it.
    const { export: latest } = await caller.privacy.latestExport();

    expect(latest).not.toHaveProperty("artifact");
  });

  test("it refuses an unauthenticated caller", async () => {
    expect(unauthenticatedCaller.privacy.latestExport()).rejects.toThrow(
      TRPCError,
    );
  });
});

describe("privacy.deletionStatus", () => {
  test("it reports what stands in the way and what will be destroyed", async () => {
    const status = await caller.privacy.deletionStatus();

    expect(status.blocked).toBe(false);
    expect(status.servers).toBeNumber();
    expect(status.scheduled_at).toBeNull();
  });

  test("an unpaid invoice blocks the request", async () => {
    await testDb.insert(invoices).values({
      userId: mockSession.user.id,
      lexwareInvoiceId: "bbbbbbbb-0000-4000-8000-000000000001",
      number: "RE-OPEN",
      total: 500,
      taxAmount: 95,
      reverseCharge: false,
    });

    const status = await caller.privacy.deletionStatus();

    expect(status.blocked).toBe(true);
    expect(status.blockers.unpaidInvoices).toBe(1);
  });
});

describe("privacy.requestDeletion", () => {
  test("it refuses while an invoice is unpaid", async () => {
    // Article 17(3)(e). The customer is told the amount rather than the rule.
    expect(caller.privacy.requestDeletion()).rejects.toThrow(
      /DELETION_BLOCKED|PRECONDITION/,
    );
  });

  test("it refuses a session that has not re-authenticated", async () => {
    expect(staleCaller.privacy.requestDeletion()).rejects.toThrow(
      /FORBIDDEN|STEP_UP/,
    );
  });

  test("it refuses an unauthenticated caller", async () => {
    expect(unauthenticatedCaller.privacy.requestDeletion()).rejects.toThrow(
      TRPCError,
    );
  });
});

describe("privacy.cancelDeletion", () => {
  test("stopping a deletion needs no step-up", async () => {
    // Deliberate: stopping something destructive should never be harder than
    // starting it. The worst an attacker achieves is leaving the customer with
    // the account they already had.
    await testDb
      .update(users)
      .set({ deletionScheduledAt: new Date(Date.now() + 86_400_000) })
      .where(eq(users.id, mockSession.user.id));

    const result = await staleCaller.privacy.cancelDeletion();

    expect(result.cancelled).toBe(true);
  });

  test("it refuses once offboarding has started", async () => {
    await testDb
      .update(users)
      .set({ offboardingStartedAt: new Date() })
      .where(eq(users.id, mockSession.user.id));

    expect(caller.privacy.cancelDeletion()).rejects.toThrow(
      /DELETION_ALREADY_IN_PROGRESS|PRECONDITION/,
    );

    await testDb
      .update(users)
      .set({ offboardingStartedAt: null })
      .where(eq(users.id, mockSession.user.id));
  });
});
