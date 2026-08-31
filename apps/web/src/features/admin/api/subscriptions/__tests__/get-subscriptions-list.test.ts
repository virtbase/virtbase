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
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

mock.module("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
mock.module("@sentry/nextjs", () => ({ captureException: () => {} }));

let refusal: Error | null = null;
mock.module("../../verify-session", () => ({
  verifySession: async () => {
    if (refusal) throw refusal;

    return { user: { id: "usr_admin", role: "ADMIN" } };
  },
}));

import { mockServer, seedServerGraph } from "@virtbase/api/testing/fixtures";
import { subscriptions } from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import type { GetSubscriptionsSchema } from "../../../lib/subscriptions/validations";
import { searchParamsCache } from "../../../lib/subscriptions/validations";
import { insertSubscription, MONTH } from "./fixtures";

let testDb: TestDb;
let getSubscriptionsList: typeof import("../get-subscriptions-list").getSubscriptionsList;
let getSubscriptionStatusCounts: typeof import("../get-subscriptions-list").getSubscriptionStatusCounts;

/** The shape `searchParamsCache.parse` hands over, with nothing filtered. */
const query = (
  overrides: Partial<GetSubscriptionsSchema> = {},
): GetSubscriptionsSchema => ({
  page: 1,
  perPage: 20,
  sort: [{ id: "currentPeriodEnd", desc: false }],
  q: "",
  status: [],
  autoRenew: null,
  mandate: null,
  currentPeriodEnd: [],
  filters: [],
  joinOperator: "and",
  ...overrides,
});

beforeAll(async () => {
  testDb = await createTestDb();
  mock.module("@virtbase/db/client", () => ({ db: testDb }));

  await seedServerGraph(testDb);

  const mod = await import("../get-subscriptions-list");
  getSubscriptionsList = mod.getSubscriptionsList;
  getSubscriptionStatusCounts = mod.getSubscriptionStatusCounts;
});

afterAll(async () => {
  await testDb.$client.close();
});

beforeEach(() => {
  refusal = null;
});

afterEach(async () => {
  await testDb.delete(subscriptions);
});

describe("getSubscriptionsList authorisation", () => {
  test("a non-admin never reaches the data", async () => {
    await insertSubscription(testDb);

    refusal = new Error("NEXT_NOT_FOUND");

    // The gate is outside the try/catch on purpose. Inside it, the refusal
    // would be swallowed and a non-admin would be shown an empty but
    // perfectly working billing console.
    await expect(getSubscriptionsList(query())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  test("the facet counts are gated too", async () => {
    refusal = new Error("NEXT_NOT_FOUND");

    await expect(getSubscriptionStatusCounts()).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("getSubscriptionsList", () => {
  test("it renders an empty page when nothing exists", async () => {
    expect(await getSubscriptionsList(query())).toEqual({
      data: [],
      pageCount: 0,
    });
  });

  test("it returns the customer, subject, status, period and flags", async () => {
    const subscription = await insertSubscription(testDb, {
      autoRenew: true,
      mandateAcceptedAt: new Date(),
    });

    const { data, pageCount } = await getSubscriptionsList(query());

    expect(pageCount).toBe(1);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      id: subscription.id,
      status: "active",
      subjectType: "server",
      subjectId: mockServer.id,
      subjectName: mockServer.name,
      autoRenew: true,
      mandateRecorded: true,
      currency: "EUR",
    });
    expect(data[0]?.user.email).toBe("test@example.com");
  });

  test("a subscription with no mandate reads as not recorded", async () => {
    await insertSubscription(testDb);

    const { data } = await getSubscriptionsList(query());

    expect(data[0]?.mandateRecorded).toBe(false);
  });

  test("it keeps a subscription whose server is gone", async () => {
    await insertSubscription(testDb, {
      subjectId: "kvm_gone_0000000000000000",
      status: "ended",
    });

    const { data } = await getSubscriptionsList(query());

    // An inner join here would hide exactly the rows a "why was I charged for
    // a server I deleted" ticket is about.
    expect(data).toHaveLength(1);
    expect(data[0]?.subjectName).toBeNull();
  });

  test("it filters by status", async () => {
    await insertSubscription(testDb, { status: "active" });
    const pastDue = await insertSubscription(testDb, {
      subjectId: "kvm_second_000000000000000",
      status: "past_due",
    });

    const { data } = await getSubscriptionsList(
      query({ status: ["past_due"] }),
    );

    expect(data).toHaveLength(1);
    expect(data[0]?.id).toBe(pastDue.id);
  });

  test("a crafted status in the URL does not empty the table", async () => {
    const active = await insertSubscription(testDb, { status: "active" });

    // The whole path, from the query string an operator can paste to the rows
    // they end up looking at. `?status=Active` used to reach the enum cast
    // verbatim; Postgres refused it, the catch below turned the throw into
    // `{ data: [], pageCount: 0 }`, and the operator saw an empty table with
    // nothing to say the filter was the problem - which is the worst answer,
    // because "no subscriptions match" is also a real one.
    const { data, pageCount } = await getSubscriptionsList(
      searchParamsCache.parse({ status: "Active" }),
    );

    expect(pageCount).toBe(1);
    expect(data.map((row) => row.id)).toEqual([active.id]);
  });

  test("it filters by auto-renew and by mandate independently", async () => {
    const enrolled = await insertSubscription(testDb, {
      autoRenew: true,
      mandateAcceptedAt: new Date(),
    });
    const unenrolled = await insertSubscription(testDb, {
      subjectId: "kvm_second_000000000000000",
      autoRenew: false,
    });

    const on = await getSubscriptionsList(query({ autoRenew: true }));
    const off = await getSubscriptionsList(query({ autoRenew: false }));
    const withMandate = await getSubscriptionsList(query({ mandate: true }));
    const without = await getSubscriptionsList(query({ mandate: false }));

    expect(on.data.map((row) => row.id)).toEqual([enrolled.id]);
    expect(off.data.map((row) => row.id)).toEqual([unenrolled.id]);
    expect(withMandate.data.map((row) => row.id)).toEqual([enrolled.id]);
    expect(without.data.map((row) => row.id)).toEqual([unenrolled.id]);
  });

  test("it searches by subscription id, subject id, server name and customer", async () => {
    const subscription = await insertSubscription(testDb);

    for (const term of [
      subscription.id,
      mockServer.id,
      mockServer.name,
      "test@example.com",
    ]) {
      const { data } = await getSubscriptionsList(query({ q: term }));

      expect(data.map((row) => row.id)).toEqual([subscription.id]);
    }

    const { data: none } = await getSubscriptionsList(
      query({ q: "nobody@example.com" }),
    );
    expect(none).toEqual([]);
  });

  test("it sorts by the soonest period end by default", async () => {
    const later = await insertSubscription(testDb, {
      currentPeriodEnd: new Date(Date.now() + 3 * MONTH),
    });
    const sooner = await insertSubscription(testDb, {
      subjectId: "kvm_second_000000000000000",
      currentPeriodEnd: new Date(Date.now() + MONTH),
    });

    const { data } = await getSubscriptionsList(query());

    expect(data.map((row) => row.id)).toEqual([sooner.id, later.id]);
  });

  test("it never returns a credential token in a list row", async () => {
    await insertSubscription(testDb);

    const list = await getSubscriptionsList(query());

    // The list joins no credential at all, and the projection is enumerated —
    // this is the assertion that keeps it that way.
    expect(JSON.stringify(list)).not.toContain("externalId");
    expect(JSON.stringify(list)).not.toContain("external_id");
  });
});

describe("getSubscriptionStatusCounts", () => {
  test("it counts every status, unfiltered", async () => {
    await insertSubscription(testDb, { status: "active" });
    await insertSubscription(testDb, {
      subjectId: "kvm_second_000000000000000",
      status: "past_due",
    });
    await insertSubscription(testDb, {
      subjectId: "kvm_third_0000000000000000",
      status: "past_due",
    });

    expect(await getSubscriptionStatusCounts()).toEqual({
      active: 1,
      past_due: 2,
    });
  });

  test("it returns nothing rather than throwing when there is nothing", async () => {
    expect(await getSubscriptionStatusCounts()).toEqual({});
  });
});
