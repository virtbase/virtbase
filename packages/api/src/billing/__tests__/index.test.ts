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

import { afterAll, describe, expect, mock, test } from "bun:test";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";

/**
 * What `@virtbase/api/billing` is allowed to hand out.
 *
 * This barrel is a package entry point that `apps/web` imports from three cron
 * routes, so what it exports is a public surface rather than an internal
 * convenience. The two things worth a test are the two that break silently: a
 * cron import that stops resolving, and a credential-bearing helper that
 * starts.
 *
 * The modules bind `db` at import time, so the in-memory Postgres has to be
 * mocked in before the barrel loads - as in every other suite here.
 */
const testDb: TestDb = await createTestDb();

mock.module("@virtbase/db/client", () => ({ db: testDb }));
mock.module("workflow/api", () => ({ start: async () => {} }));

const billing = await import("../index");

afterAll(async () => {
  await testDb.$client.close();
});

describe("the billing entry point", () => {
  test("still carries everything the crons and the router import", () => {
    // `/api/cron/renew-subscriptions`, `/api/cron/retry-renewals`,
    // `/api/cron/reconcile-renewals` and `router/subscriptions.ts`.
    for (const name of [
      "renewDueSubscriptions",
      "retryDueRenewals",
      "reconcileRenewals",
      "retryRenewal",
    ] as const) {
      expect(typeof billing[name]).toBe("function");
    }
  });

  test("does not re-export the helpers that read a provider credential", () => {
    // `collect.ts` is one of the two modules allowed to read
    // `payment_methods.external_id`, the token an off-session charge is made
    // against - which `payment-methods/list.ts` and `PaymentMethodSchema` both
    // go out of their way to keep off the wire. Re-exporting it here would be
    // a one-line way around both, from a module `apps/web` already imports.
    for (const name of [
      "resolveRenewalPaymentMethod",
      "collectForRenewal",
      "renewalIdempotencyKey",
    ]) {
      expect(billing).not.toHaveProperty(name);
    }
  });
});
