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

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "@virtbase/db";
import {
  abuseCaseEvents,
  abuseCaseServers,
  abuseCases,
  abuseRules,
  abuseSignals,
  subnetAllocations,
  subnets,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import type { InboundSignal } from "@virtbase/ports";

// The dispatcher writes delivery rows to the real database and resolves the
// integration registry; neither belongs in a test of the pipeline that calls
// it. What is asserted here is that it is called, and with what.
const dispatched: { key: string; audience: unknown }[] = [];
mock.module("../../notifications/dispatch", () => ({
  dispatchNotification: async (input: { key: string; audience: unknown }) => {
    dispatched.push({ key: input.key, audience: input.audience });
    return {
      created: 1,
      deduplicated: 0,
      delivered: 1,
      skipped: 0,
      failed: 0,
    };
  },
}));

import {
  mockProxmoxNode,
  mockServer,
  mockSession,
  seedServerGraph,
} from "../../testing";
import { countRecentResolvedCases } from "../case";
import { submitSignal } from "../intake";

let testDb: TestDb;

const IP = "203.0.113.20";
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

const signal = (overrides: Partial<InboundSignal> = {}): InboundSignal => ({
  source: "test",
  externalId: `ext-${Math.random()}`,
  type: "abuse.spam",
  state: "firing",
  severity: "warning",
  subject: { kind: "ip", value: IP },
  title: "Outbound spam from 203.0.113.20",
  body: "Received 400 messages in one minute.",
  occurredAt: hoursAgo(1),
  ...overrides,
});

const submit = (overrides: Partial<InboundSignal> = {}) =>
  submitSignal({ db: testDb as never, signal: signal(overrides) });

const readCase = (id: string) =>
  testDb
    .select()
    .from(abuseCases)
    .where(eq(abuseCases.id, id))
    .limit(1)
    .then(([row]) => row);

const trustedRule = (overrides: Record<string, unknown> = {}) =>
  testDb.insert(abuseRules).values({
    name: "Trusted spam",
    matchType: "abuse.*",
    trustedSource: true,
    actionEnforcement: "isolate",
    actionGraceMinutes: 30,
    actionResponseHours: 12,
    ...overrides,
  });

beforeEach(async () => {
  dispatched.length = 0;
  testDb = await createTestDb();

  await seedServerGraph(testDb);
  await testDb
    .insert(subnets)
    .values({ id: "ipsub_x", cidr: `${IP}/32`, gateway: "203.0.113.1" });
  await testDb.insert(subnetAllocations).values({
    subnetId: "ipsub_x",
    serverId: mockServer.id,
    allocatedAt: hoursAgo(240),
  });
});

afterEach(async () => {
  await testDb.$client.close();
});

describe("submitSignal", () => {
  test("records a signal and attributes it", async () => {
    const result = await submit();

    const [row] = await testDb.select().from(abuseSignals);

    expect(row).toMatchObject({
      id: result.signalId,
      source: "test",
      type: "abuse.spam",
      attribution: "attributed",
      serverId: mockServer.id,
      userId: mockSession.user.id,
      occurrences: 1,
    });
    expect(result.deduplicated).toBe(false);
  });

  test("collapses a repeat onto the same row", async () => {
    // Alertmanager re-sends a still-firing alert every repeat interval. Each
    // repeat must not be a new case, or a flapping alert pages all night.
    const first = await submit({ externalId: "same" });
    const second = await submit({ externalId: "same" });

    expect(second.signalId).toBe(first.signalId);
    expect(second.deduplicated).toBe(true);
    expect(second.caseId).toBe(first.caseId as string);

    const rows = await testDb.select().from(abuseSignals);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.occurrences).toBe(2);

    const cases = await testDb.select().from(abuseCases);
    expect(cases).toHaveLength(1);
  });

  test("a resolved signal opens no case", async () => {
    const result = await submit({ state: "resolved" });

    expect(result.caseId).toBeUndefined();
    const [row] = await testDb.select().from(abuseSignals);
    expect(row?.resolvedAt).not.toBeNull();
    expect(await testDb.select().from(abuseCases)).toHaveLength(0);
  });

  test("a non-abuse signal notifies and opens no case", async () => {
    const result = await submit({
      type: "node.disk_pressure",
      subject: { kind: "node", value: mockProxmoxNode.hostname },
    });

    expect(result.caseId).toBeUndefined();
    expect(await testDb.select().from(abuseCases)).toHaveLength(0);
    expect(dispatched.map((entry) => entry.key)).toEqual([
      "node.disk_pressure",
    ]);
  });

  test("an unattributed report is escalated, not filed", async () => {
    const result = await submit({
      subject: { kind: "ip", value: "198.51.100.9" },
    });

    expect(result.caseId).toBeUndefined();
    expect(dispatched.map((entry) => entry.key)).toEqual([
      "abuse.signal.unattributed",
    ]);
  });

  test("without a trusted rule the case waits for a human", async () => {
    const result = await submit();
    const abuseCase = await readCase(result.caseId as string);

    // The whole defence against a competitor filing plausible reports.
    expect(abuseCase).toMatchObject({
      status: "triage",
      enforcement: "none",
      blocksOrdering: false,
      respondBy: null,
    });
    // Operators are told; the customer is not accused on one report.
    expect(dispatched.map((entry) => entry.key)).toEqual(["abuse.case.opened"]);
  });

  test("a trusted rule opens the case, decides enforcement and starts the clock", async () => {
    await trustedRule();

    const result = await submit();
    const abuseCase = await readCase(result.caseId as string);

    expect(result.enforcement).toBe("isolate");
    expect(abuseCase?.status).toBe("awaiting_customer");
    expect(abuseCase?.enforcement).toBe("isolate");
    // Decided, not applied: the grace window is in the future and nothing has
    // touched the server.
    expect(abuseCase?.enforceAt?.getTime()).toBeGreaterThan(Date.now());
    expect(abuseCase?.enforcedAt).toBeNull();
    expect(abuseCase?.respondBy?.getTime()).toBeGreaterThan(Date.now());

    expect(dispatched.map((entry) => entry.key)).toEqual([
      "abuse.case.opened",
      "abuse.case.notice",
    ]);
  });

  test("a stale attribution never enforces, however trusted the rule", async () => {
    await trustedRule();

    // The address moved on after the reported moment.
    await testDb
      .update(subnetAllocations)
      .set({ deallocatedAt: hoursAgo(2) })
      .where(eq(subnetAllocations.subnetId, "ipsub_x"));

    const result = await submit({ occurredAt: hoursAgo(48) });
    const abuseCase = await readCase(result.caseId as string);

    expect(abuseCase?.staleAttribution).toBe(true);
    expect(abuseCase?.enforcement).toBe("none");
  });

  test("a second report joins the open case rather than opening another", async () => {
    const first = await submit({ externalId: "one" });
    const second = await submit({ externalId: "two" });

    expect(second.caseId).toBe(first.caseId as string);
    expect(await testDb.select().from(abuseCases)).toHaveLength(1);

    // Different key, so a target can tell a new case from another report on
    // one it already knows about.
    expect(dispatched.map((entry) => entry.key)).toEqual([
      "abuse.case.opened",
      "abuse.case.updated",
    ]);
  });

  test("a different category opens its own case", async () => {
    const first = await submit({ externalId: "one", type: "abuse.spam" });
    const second = await submit({ externalId: "two", type: "abuse.ddos" });

    expect(second.caseId).not.toBe(first.caseId as string);
    expect(await testDb.select().from(abuseCases)).toHaveLength(2);
  });

  test("a more severe report raises the case it joins", async () => {
    const first = await submit({ externalId: "one", severity: "info" });
    expect((await readCase(first.caseId as string))?.severity).toBe("low");

    await submit({ externalId: "two", severity: "critical" });
    expect((await readCase(first.caseId as string))?.severity).toBe("critical");
  });

  test("links the implicated server and writes an audit trail", async () => {
    const result = await submit();

    const links = await testDb
      .select()
      .from(abuseCaseServers)
      .where(eq(abuseCaseServers.caseId, result.caseId as string));
    expect(links).toHaveLength(1);
    expect(links[0]?.serverId).toBe(mockServer.id);
    expect(links[0]?.lockLevel).toBe("none");

    const events = await testDb
      .select()
      .from(abuseCaseEvents)
      .where(eq(abuseCaseEvents.caseId, result.caseId as string));
    expect(events.map((event) => event.type).sort()).toEqual([
      "case.opened",
      "signal.attached",
    ]);
  });

  test("sanitises reporter text before it is stored", async () => {
    await submit({
      title: "Spam from‮ gnihsihp ​203.0.113.20",
      body: "line one\n\n\n\n\nline two",
    });

    const [row] = await testDb.select().from(abuseSignals);

    // A right-to-left override in a report can make the console display an
    // address that is not the one on the case.
    expect(row?.title).not.toContain("‮");
    expect(row?.title).not.toContain("​");
    expect(row?.body).toBe("line one\n\nline two");
  });

  test("refuses a malformed address rather than reaching the database with it", async () => {
    expect(
      submitSignal({
        db: testDb as never,
        signal: signal({
          subject: { kind: "ip", value: "not-an-address'; DROP TABLE --" },
        }),
      }),
    ).rejects.toThrow();
  });
});

describe("countRecentResolvedCases", () => {
  const settled = (values: Record<string, unknown>) =>
    testDb.insert(abuseCases).values({
      userId: mockSession.user.id,
      category: "spam",
      severity: "high",
      status: "resolved",
      title: "Settled",
      closedAt: new Date(),
      ...values,
    } as never);

  const count = () =>
    countRecentResolvedCases({
      db: testDb as never,
      userId: mockSession.user.id,
    });

  test("counts a case that was actually settled against the customer", async () => {
    await settled({ resolution: "fixed_by_customer" });
    expect(await count()).toBe(1);
  });

  test("a case we closed as a false positive is not a prior offence", async () => {
    // The corroboration a malicious reporter would otherwise manufacture: file
    // a plausible report, have it thrown out, file again and watch the repeat
    // count let a trusted rule enforce on the second one.
    await settled({ resolution: "false_positive" });
    await settled({ resolution: "not_our_range" });

    expect(await count()).toBe(0);
  });

  test("still counts a resolved case with no reason recorded", async () => {
    // Closed against the customer, just without the column filled in. A
    // `NOT IN` on a NULL would silently drop it.
    await settled({ resolution: null });
    expect(await count()).toBe(1);
  });

  test("a rule gated on prior cases does not fire on a false positive", async () => {
    await settled({ resolution: "false_positive", createdAt: hoursAgo(48) });
    await trustedRule({ matchRepeatCountMin: 1 });

    const result = await submit();
    const abuseCase = await readCase(result.caseId as string);

    // No rule matched, so the case waits for a person instead of isolating a
    // server on the strength of a report we ourselves rejected.
    expect(abuseCase?.status).toBe("triage");
    expect(abuseCase?.enforcement).toBe("none");
  });
});
