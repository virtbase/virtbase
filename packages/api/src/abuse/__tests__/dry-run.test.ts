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

import { beforeEach, describe, expect, test } from "bun:test";
import {
  abuseCases,
  abuseRules,
  abuseSignals,
  users,
} from "@virtbase/db/schema";
import type { TestDb } from "@virtbase/db/test-client";
import { createTestDb } from "@virtbase/db/test-client";
import { mockSession } from "../../testing";
import { dryRunAbuseRules } from "../dry-run";

let testDb: TestDb;

/** The draft as the editor submits it: no id, every column present. */
const draft = (overrides: Record<string, unknown> = {}) =>
  ({
    id: null,
    enabled: true,
    priority: 100,
    name: "Draft",
    description: null,
    matchType: "abuse.*",
    matchSource: null,
    matchSeverityMin: null,
    matchConfidenceMin: null,
    matchLabels: {},
    matchRepeatCountMin: null,
    trustedSource: false,
    actionOpenCase: true,
    actionCategory: null,
    actionCaseSeverity: null,
    actionEnforcement: "none",
    actionGraceMinutes: 0,
    actionBlockOrders: false,
    actionNotifyUser: true,
    actionResponseHours: 24,
    actionAutoCloseHours: null,
    ...overrides,
  }) as never;

let counter = 0;
const insertSignal = (overrides: Record<string, unknown> = {}) =>
  testDb.insert(abuseSignals).values({
    source: "abuseipdb",
    externalId: `ext-${++counter}`,
    type: "abuse.spam",
    severity: "warning",
    subjectKind: "ip",
    subjectValue: "203.0.113.20",
    title: `Signal ${counter}`,
    confidence: 80,
    attribution: "attributed",
    userId: mockSession.user.id,
    occurredAt: new Date(),
    ...overrides,
  } as never);

const run = (overrides: Record<string, unknown> = {}) =>
  dryRunAbuseRules({ db: testDb as never, draft: draft(overrides) });

beforeEach(async () => {
  counter = 0;
  testDb = await createTestDb();
  await testDb.insert(users).values(mockSession.user);
});

describe("dryRunAbuseRules", () => {
  test("replays only the signals that would reach the matcher", async () => {
    await insertSignal();
    // Never reaches a rule: intake stops before the matcher without a
    // customer to hold responsible.
    await insertSignal({ userId: null, attribution: "unattributed" });
    // Not an abuse signal at all.
    await insertSignal({ type: "node.disk_pressure" });

    const result = await run();

    expect(result.considered).toBe(1);
    expect(result.matched).toBe(1);
    expect(result.wins).toBe(1);
  });

  test("counts a match the draft does not win as shadowed", async () => {
    await insertSignal();

    await testDb.insert(abuseRules).values({
      id: "abrul_first",
      name: "Catch-all",
      priority: 10,
      matchType: "abuse.*",
    });

    const result = await run({ priority: 100 });

    expect(result.matched).toBe(1);
    expect(result.wins).toBe(0);
    expect(result.shadowedBy).toEqual([
      { ruleId: "abrul_first", name: "Catch-all", priority: 10, count: 1 },
    ]);
  });

  test("a disabled rule higher up does not shadow", async () => {
    await insertSignal();

    await testDb.insert(abuseRules).values({
      name: "Switched off",
      priority: 10,
      matchType: "abuse.*",
      enabled: false,
    });

    const result = await run();

    expect(result.wins).toBe(1);
    expect(result.shadowedBy).toEqual([]);
  });

  test("the stored twin of the draft is replaced, not evaluated twice", async () => {
    await insertSignal();

    await testDb.insert(abuseRules).values({
      id: "abrul_self",
      name: "Stored",
      priority: 10,
      matchType: "abuse.*",
    });

    // Editing that rule to a narrower type: it must stop matching, rather
    // than the stored version shadowing the draft with its old conditions.
    const result = await dryRunAbuseRules({
      db: testDb as never,
      draft: draft({ id: "abrul_self", matchType: "abuse.ddos" }),
    });

    expect(result.matched).toBe(0);
    expect(result.shadowedBy).toEqual([]);
  });

  test("only a trusted rule reports enforcement", async () => {
    await insertSignal();

    const advisory = await run({ actionEnforcement: "isolate" });
    expect(advisory.wins).toBe(1);
    expect(advisory.enforcing).toBe(0);
    expect(advisory.decision.status).toBe("triage");

    const trusted = await run({
      actionEnforcement: "isolate",
      trustedSource: true,
    });
    expect(trusted.enforcing).toBe(1);
    expect(trusted.decision.status).toBe("open");
    expect(trusted.decision.enforcement).toBe("isolate");
  });

  test("stale attribution is counted and disarms enforcement", async () => {
    await insertSignal({ attribution: "stale" });

    const result = await run({
      actionEnforcement: "power_off",
      trustedSource: true,
    });

    expect(result.wins).toBe(1);
    expect(result.stale).toBe(1);
    // The address may belong to somebody else by now, so the same rule that
    // would power a server off does nothing here.
    expect(result.enforcing).toBe(0);
  });

  test("honours the conditions it is given", async () => {
    await insertSignal({ severity: "info", confidence: 20 });
    await insertSignal({ severity: "critical", confidence: 95 });

    const result = await run({ matchConfidenceMin: 90 });

    expect(result.considered).toBe(2);
    expect(result.matched).toBe(1);
  });

  test("writes nothing", async () => {
    await insertSignal();

    await run({ actionEnforcement: "isolate", trustedSource: true });

    expect(await testDb.select().from(abuseCases)).toHaveLength(0);
    expect(await testDb.select().from(abuseRules)).toHaveLength(0);
  });
});
