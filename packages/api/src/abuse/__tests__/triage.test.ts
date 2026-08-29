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
  abuseCaseMessages,
  abuseCaseServers,
  abuseCases,
  abuseSignals,
  datacenters,
  proxmoxNodeGroups,
  proxmoxNodes,
  serverPlanPrices,
  serverPlans,
  servers,
  subnetAllocations,
  subnets,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";

mock.module("../../notifications/dispatch", () => ({
  dispatchNotification: async () => ({
    created: 0,
    deduplicated: 0,
    delivered: 0,
    skipped: 0,
    failed: 0,
  }),
}));

/** What the model would have said, without paying a model to say it. */
let answer: Record<string, unknown> | null = null;
mock.module("../triage/classify", () => ({
  isTriageAvailable: () => true,
  classifyAbuseReport: async () => answer,
}));

import {
  mockDatacenter,
  mockProxmoxNode,
  mockProxmoxNodeGroup,
  mockServer,
  mockServerPlan,
  mockServerPlanPrice,
  mockSession,
} from "../../testing";
import { verifiedAddresses } from "../triage/addresses";
import { classifyAbuseCase, sweepUntriagedCases } from "../triage/apply";

let testDb: TestDb;

const CASE_ID = "abus_0000000000000000000000001";
const REPORTED_IP = "45.83.100.10";
const REPORT = `Sustained scanning from ${REPORTED_IP} against our /24 at 198.51.100.0/24.`;

const classification = (overrides: Record<string, unknown> = {}) => ({
  is_abuse_report: true,
  category: "port_scan",
  severity: "high",
  addresses: [REPORTED_IP],
  summary: "The server was reported for port scanning.",
  confidence: 88,
  reasoning: "The report names a source address and lists scanned ports.",
  ...overrides,
});

const seedCase = async (values: Record<string, unknown> = {}) => {
  await testDb.insert(abuseCases).values({
    id: CASE_ID,
    userId: null,
    category: "other",
    severity: "medium",
    status: "triage",
    title: "Portscan detected",
    ...values,
  } as never);

  await testDb.insert(abuseCaseMessages).values({
    caseId: CASE_ID,
    authorKind: "reporter",
    authorEmail: "soc@example.org",
    audience: "reporter",
    body: REPORT,
  });
};

const readCase = () =>
  testDb
    .select()
    .from(abuseCases)
    .where(eq(abuseCases.id, CASE_ID))
    .then(([row]) => row);

beforeEach(async () => {
  answer = classification();
  testDb = await createTestDb();

  await testDb.insert(users).values(mockSession.user);
  await testDb.insert(datacenters).values(mockDatacenter);
  await testDb.insert(proxmoxNodeGroups).values(mockProxmoxNodeGroup);
  await testDb.insert(serverPlans).values(mockServerPlan);
  await testDb.insert(serverPlanPrices).values(mockServerPlanPrice);
  await testDb.insert(proxmoxNodes).values(mockProxmoxNode);
  await testDb.insert(servers).values(mockServer);
  await testDb.insert(subnets).values({
    id: "ipsub_a",
    cidr: `${REPORTED_IP}/32`,
    gateway: "45.83.100.1",
  });
  await testDb.insert(subnetAllocations).values({
    subnetId: "ipsub_a",
    serverId: mockServer.id,
    allocatedAt: new Date(Date.now() - 30 * 86_400_000),
  });

  await seedCase();
});

afterEach(async () => {
  await testDb.$client.close();
});

describe("classifyAbuseCase", () => {
  test("fills in the category and attributes the case", async () => {
    const result = await classifyAbuseCase({
      db: testDb as never,
      caseId: CASE_ID,
    });

    expect(result).toMatchObject({
      classified: true,
      attributedTo: mockSession.user.id,
      addresses: [REPORTED_IP],
    });

    const abuseCase = await readCase();
    expect(abuseCase?.category).toBe("port_scan");
    expect(abuseCase?.severity).toBe("high");
    expect(abuseCase?.userId).toBe(mockSession.user.id);
    expect(abuseCase?.classifiedAt).not.toBeNull();

    // The implicated server is linked, but nothing is locked.
    const [link] = await testDb.select().from(abuseCaseServers);
    expect(link?.serverId).toBe(mockServer.id);
    expect(link?.lockLevel).toBe("none");
  });

  test("never moves the case out of triage or enforces", async () => {
    // The single most important property. A model reading an accusation must
    // not be able to restrict anybody's service.
    await classifyAbuseCase({ db: testDb as never, caseId: CASE_ID });

    const abuseCase = await readCase();
    expect(abuseCase?.status).toBe("triage");
    expect(abuseCase?.enforcement).toBe("none");
    expect(abuseCase?.enforcedAt).toBeNull();
    expect(abuseCase?.respondBy).toBeNull();
    expect(abuseCase?.blocksOrdering).toBe(false);
  });

  test("emits no signal, so nothing it says can reach a rule", async () => {
    // Rules act on signals. A classifier that never produces one cannot cause
    // an enforcement whatever a rule is configured to do - which is a stronger
    // guarantee than capping its confidence would be.
    await classifyAbuseCase({ db: testDb as never, caseId: CASE_ID });

    expect(await testDb.select().from(abuseSignals)).toHaveLength(0);
  });

  test("does not overrule a category an operator already chose", async () => {
    await testDb
      .update(abuseCases)
      .set({ category: "copyright", severity: "critical" })
      .where(eq(abuseCases.id, CASE_ID));

    await classifyAbuseCase({ db: testDb as never, caseId: CASE_ID });

    const abuseCase = await readCase();
    expect(abuseCase?.category).toBe("copyright");
    expect(abuseCase?.severity).toBe("critical");
  });

  test("does not re-attribute a case that already has a customer", async () => {
    await testDb
      .update(abuseCases)
      .set({ userId: mockSession.user.id })
      .where(eq(abuseCases.id, CASE_ID));

    const result = await classifyAbuseCase({
      db: testDb as never,
      caseId: CASE_ID,
    });

    expect(result.attributedTo).toBeNull();
    expect(await testDb.select().from(abuseCaseServers)).toHaveLength(0);
  });

  test("discards an address the report does not contain", async () => {
    // The guard that turns the model into a highlighter rather than a source
    // of facts.
    answer = classification({ addresses: ["203.0.113.99"] });

    const result = await classifyAbuseCase({
      db: testDb as never,
      caseId: CASE_ID,
    });

    expect(result.addresses).toEqual([]);
    expect((await readCase())?.userId).toBeNull();
  });

  test("records what it decided where an operator reads it", async () => {
    await classifyAbuseCase({ db: testDb as never, caseId: CASE_ID });

    const [note] = await testDb
      .select()
      .from(abuseCaseMessages)
      .where(eq(abuseCaseMessages.authorKind, "system"));

    // Internal, not customer-facing: a machine's reading of an accusation is
    // not something to put in front of the accused.
    expect(note?.audience).toBe("internal");
    expect(note?.body).toContain("88% confidence");
    expect(note?.body).toContain("Advisory only");

    const events = await testDb
      .select()
      .from(abuseCaseEvents)
      .where(eq(abuseCaseEvents.caseId, CASE_ID));
    expect(events.map((event) => event.type)).toContain("triage.classified");
  });

  test("says so when the mail is not a report at all", async () => {
    answer = classification({
      is_abuse_report: false,
      category: "other",
      addresses: [],
    });

    const result = await classifyAbuseCase({
      db: testDb as never,
      caseId: CASE_ID,
    });

    expect(result.reason).toBe("not an abuse report");
    // Left in triage rather than closed: rejecting a case is a person's call.
    expect((await readCase())?.status).toBe("triage");
    expect((await readCase())?.userId).toBeNull();
  });

  test("a classifier outage is retried, not recorded as an answer", async () => {
    answer = null;

    const result = await classifyAbuseCase({
      db: testDb as never,
      caseId: CASE_ID,
    });

    expect(result.classified).toBe(false);
    // No timestamp, so the next sweep picks it up again.
    expect((await readCase())?.classifiedAt).toBeNull();
  });

  test("does not attribute when the address moved on since the report", async () => {
    // The report is dated now, but the allocation ended before it. The rest of
    // the pipeline follows the same rule, and so does this.
    await testDb
      .update(subnetAllocations)
      .set({ deallocatedAt: new Date(Date.now() - 86_400_000) })
      .where(eq(subnetAllocations.subnetId, "ipsub_a"));

    const result = await classifyAbuseCase({
      db: testDb as never,
      caseId: CASE_ID,
    });

    expect(result.attributedTo).toBeNull();
    expect((await readCase())?.userId).toBeNull();
  });
});

describe("sweepUntriagedCases", () => {
  test("looks only at cases nobody has classified", async () => {
    const first = await sweepUntriagedCases({ db: testDb as never });
    expect(first).toMatchObject({ looked: 1, classified: 1, attributed: 1 });

    const second = await sweepUntriagedCases({ db: testDb as never });
    expect(second.looked).toBe(0);
  });

  test("ignores cases that are past triage", async () => {
    await testDb
      .update(abuseCases)
      .set({ status: "open", userId: mockSession.user.id })
      .where(eq(abuseCases.id, CASE_ID));

    expect(await sweepUntriagedCases({ db: testDb as never })).toMatchObject({
      looked: 0,
    });
  });
});

describe("verifiedAddresses", () => {
  test("keeps an address the report really contains", () => {
    expect(
      verifiedAddresses(
        classification() as never,
        `scanning from ${REPORTED_IP}`,
      ),
    ).toEqual([REPORTED_IP]);
  });

  test("drops one it does not", () => {
    expect(
      verifiedAddresses(
        classification({ addresses: ["203.0.113.99"] }) as never,
        `scanning from ${REPORTED_IP}`,
      ),
    ).toEqual([]);
  });

  test("understands the defanged notation security teams write", () => {
    expect(
      verifiedAddresses(
        classification() as never,
        "C2 beacon at 45.83.100[.]10",
      ),
    ).toEqual([REPORTED_IP]);
  });
});
