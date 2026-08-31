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
import {
  serverPlanPrices,
  servers,
  subscriptions,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import {
  mockServer,
  mockServerPlan,
  mockServerPlanPrice,
  mockSession,
  seedServerInfrastructure,
} from "../../testing/fixtures";
import {
  backfillSubscriptions,
  findBackfillCandidates,
  periodStartFor,
} from "../subscriptions";

let testDb: TestDb;

const USER_ID = mockSession.user.id;
const OTHER_PRICE_ID = "price_0000000000000000000000001";

/** The term every seeded server is inside, and the start it implies. */
const TERM_END = new Date("2026-09-15T08:30:00.000Z");
const TERM_START = new Date("2026-08-15T08:30:00.000Z");

/** Ids are the paging key, so they are written to sort predictably. */
const serverId = (n: number) =>
  `kvm_${n.toString().padStart(25, "0")}` as const;

const addServer = async (
  n: number,
  values: Partial<typeof servers.$inferInsert> = {},
) => {
  const row = {
    ...mockServer,
    id: serverId(n),
    name: `Server ${n}`,
    vmid: 1000 + n,
    terminatesAt: TERM_END,
    suspendedAt: null,
    ...values,
  };

  await testDb.insert(servers).values(row);

  return row;
};

const subscriptionRows = () =>
  testDb.select().from(subscriptions).orderBy(asc(subscriptions.subjectId));

const backfill = (
  options: Partial<Parameters<typeof backfillSubscriptions>[0]> = {},
) => backfillSubscriptions({ db: testDb as never, ...options });

beforeAll(async () => {
  testDb = await createTestDb();

  await testDb.insert(users).values(mockSession.user).onConflictDoNothing();
  await seedServerInfrastructure(testDb);

  // A second price row, so "the server's locked price" is a claim a test can
  // actually distinguish from "the only price in the database".
  await testDb.insert(serverPlanPrices).values({
    id: OTHER_PRICE_ID,
    serverPlanId: mockServerPlan.id,
    purchasePrice: 4999,
    renewalPrice: 5999,
  });
});

afterAll(async () => {
  await testDb.$client.close();
});

afterEach(async () => {
  await testDb.delete(subscriptions);
  await testDb.delete(servers);
});

describe("periodStartFor", () => {
  test("it goes back one calendar month and keeps the time of day", () => {
    expect(periodStartFor(new Date("2026-09-15T08:30:00.000Z"))).toEqual(
      new Date("2026-08-15T08:30:00.000Z"),
    );
  });

  test("it clamps into a short month the way Postgres does", () => {
    // 31 Mar - 1 month is 28 Feb, not 3 Mar. A period that started "on the
    // 31st of February" is not a date, and a naive `setMonth` produces one.
    expect(periodStartFor(new Date("2026-03-31T00:00:00.000Z"))).toEqual(
      new Date("2026-02-28T00:00:00.000Z"),
    );
    expect(periodStartFor(new Date("2028-03-31T00:00:00.000Z"))).toEqual(
      new Date("2028-02-29T00:00:00.000Z"),
    );
  });

  test("it crosses the year boundary", () => {
    expect(periodStartFor(new Date("2026-01-10T00:00:00.000Z"))).toEqual(
      new Date("2025-12-10T00:00:00.000Z"),
    );
  });

  test("it always lands strictly before the period end", () => {
    // What the `subscriptions_period_range` check constraint requires.
    for (const iso of [
      "2026-01-31T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
      "2026-12-31T23:59:59.999Z",
      "2028-02-29T12:00:00.000Z",
    ]) {
      const end = new Date(iso);
      expect(periodStartFor(end).getTime()).toBeLessThan(end.getTime());
    }
  });
});

describe("findBackfillCandidates", () => {
  test("it takes a server with a term and no subscription", async () => {
    const server = await addServer(1);

    const [candidate] = await findBackfillCandidates(testDb as never);

    expect(candidate).toMatchObject({
      serverId: server.id,
      serverName: server.name,
      userId: USER_ID,
      serverPlanPriceId: mockServerPlanPrice.id,
      currentPeriodEnd: TERM_END,
      currentPeriodStart: TERM_START,
    });
  });

  test("it reads the price locked to the server, not the only one there is", async () => {
    await addServer(1, { serverPlanPriceId: OTHER_PRICE_ID });

    const [candidate] = await findBackfillCandidates(testDb as never);

    expect(candidate?.serverPlanPriceId).toBe(OTHER_PRICE_ID);
  });

  test("it skips a server with no term", async () => {
    await addServer(1, { terminatesAt: null });

    expect(await findBackfillCandidates(testDb as never)).toEqual([]);
  });

  test("it skips a suspended server", async () => {
    await addServer(1, { suspendedAt: new Date("2026-08-01T00:00:00.000Z") });

    expect(await findBackfillCandidates(testDb as never)).toEqual([]);
  });

  test.each(["active", "past_due", "suspended", "cancelled"] as const)(
    "it skips a server whose subscription is %s",
    async (status) => {
      const server = await addServer(1);
      await testDb.insert(subscriptions).values({
        userId: USER_ID,
        subjectId: server.id,
        serverPlanPriceId: mockServerPlanPrice.id,
        status,
        currentPeriodStart: TERM_START,
        currentPeriodEnd: TERM_END,
      });

      expect(await findBackfillCandidates(testDb as never)).toEqual([]);
    },
  );

  test("it takes a server whose subscription has ended", async () => {
    // `ended` is the one state a subject may have twice - the partial unique
    // index is written on exactly that predicate.
    const server = await addServer(1);
    await testDb.insert(subscriptions).values({
      userId: USER_ID,
      subjectId: server.id,
      serverPlanPriceId: mockServerPlanPrice.id,
      status: "ended",
      currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
    });

    expect(await findBackfillCandidates(testDb as never)).toHaveLength(1);
  });

  test("it pages forward from a cursor", async () => {
    await addServer(1);
    await addServer(2);
    await addServer(3);

    const first = await findBackfillCandidates(testDb as never, { limit: 2 });
    const rest = await findBackfillCandidates(testDb as never, {
      after: first[1]?.serverId,
    });

    expect(first.map((c) => c.serverId)).toEqual([serverId(1), serverId(2)]);
    expect(rest.map((c) => c.serverId)).toEqual([serverId(3)]);
  });
});

describe("backfillSubscriptions", () => {
  test("a dry run is what you get for free, and it writes nothing", async () => {
    await addServer(1);
    await addServer(2);

    const seen: string[] = [];
    const result = await backfill({
      onCandidate: (candidate) => seen.push(candidate.serverId),
    });

    expect(result.dryRun).toBe(true);
    // The count the safe mode prints is the count the real run will write.
    expect(result).toMatchObject({ scanned: 2, created: 2, skipped: 0 });
    expect(seen).toEqual([serverId(1), serverId(2)]);
    expect(await subscriptionRows()).toEqual([]);
  });

  test("it writes one subscription per server with --apply", async () => {
    const server = await addServer(1);
    await addServer(2);

    const result = await backfill({ dryRun: false });

    expect(result).toMatchObject({ scanned: 2, created: 2, skipped: 0 });

    const rows = await subscriptionRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      userId: USER_ID,
      subjectType: "server",
      subjectId: server.id,
      serverPlanPriceId: mockServerPlanPrice.id,
      intervalMonths: 1,
      currency: "EUR",
      status: "active",
      currentPeriodEnd: TERM_END,
      currentPeriodStart: TERM_START,
    });
  });

  test("it never enrols anybody in automatic charging", async () => {
    await addServer(1);
    await addServer(2, { terminatesAt: new Date("2026-03-31T00:00:00.000Z") });

    // There is no option that turns this on. Passing one anyway - which is a
    // type error, hence the cast - must still produce `auto_renew: false`,
    // because the value is a literal in the insert and not a parameter.
    const forbidden = {
      autoRenew: true,
      mandateAcceptedAt: new Date(),
    } as unknown as Partial<Parameters<typeof backfillSubscriptions>[0]>;

    await backfill({ dryRun: false, ...forbidden });

    const rows = await subscriptionRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.autoRenew).toBe(false);
      expect(row.mandateAcceptedAt).toBeNull();
      expect(row.mandateTextVersion).toBeNull();
      expect(row.paymentMethodId).toBeNull();
    }
  });

  test("running it twice creates nothing the second time", async () => {
    await addServer(1);
    await addServer(2);

    const first = await backfill({ dryRun: false });
    const second = await backfill({ dryRun: false });

    expect(first.created).toBe(2);
    // Not "skipped": the candidate query no longer matches them at all, which
    // is what makes an interrupted run resumable without a cursor.
    expect(second).toMatchObject({ scanned: 0, created: 0, skipped: 0 });
    expect(await subscriptionRows()).toHaveLength(2);
  });

  test("a subscription created underneath it is skipped, not a crash", async () => {
    const server = await addServer(1);

    // The race the partial unique index exists for: a provisioning workflow,
    // or a second copy of this script, between the read and the insert.
    const candidates = await findBackfillCandidates(testDb as never);
    await testDb.insert(subscriptions).values({
      userId: USER_ID,
      subjectId: server.id,
      serverPlanPriceId: mockServerPlanPrice.id,
      currentPeriodStart: TERM_START,
      currentPeriodEnd: TERM_END,
    });

    expect(candidates).toHaveLength(1);
    await expect(backfill({ dryRun: false })).resolves.toMatchObject({
      created: 0,
    });
    expect(await subscriptionRows()).toHaveLength(1);
  });

  test("it batches without loading the fleet into memory", async () => {
    for (let n = 1; 6 >= n; n++) await addServer(n);

    const batches: number[] = [];
    const result = await backfill({
      dryRun: false,
      batchSize: 2,
      onProgress: ({ scanned }) => batches.push(scanned),
    });

    expect(batches).toEqual([2, 4, 6]);
    expect(result.created).toBe(6);
  });

  test("a bounded run reports where to resume from", async () => {
    for (let n = 1; 5 >= n; n++) await addServer(n);

    const first = await backfill({ dryRun: false, limit: 2 });

    expect(first).toMatchObject({ scanned: 2, created: 2 });
    expect(first.cursor).toBe(serverId(2));

    const second = await backfill({ dryRun: false, after: first.cursor });

    expect(second).toMatchObject({ scanned: 3, created: 3 });
    expect(await subscriptionRows()).toHaveLength(5);
  });

  test("it leaves the servers themselves alone", async () => {
    const server = await addServer(1);

    await backfill({ dryRun: false });

    const after = await testDb
      .select()
      .from(servers)
      .where(eq(servers.id, server.id))
      .then(([row]) => row);

    expect(after?.terminatesAt).toEqual(server.terminatesAt);
    expect(after?.suspendedAt).toBeNull();
  });
});
