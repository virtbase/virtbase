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

import { describe, expect, test } from "bun:test";
import type { AbuseRule } from "@virtbase/db/schema";
import type { RuleMatchInput } from "../rules";
import { ruleMatches } from "../rules";

const makeRule = (overrides: Partial<AbuseRule> = {}): AbuseRule =>
  ({
    id: "abrul_1",
    enabled: true,
    priority: 100,
    name: "Rule",
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as AbuseRule;

const input = (overrides: Partial<RuleMatchInput> = {}): RuleMatchInput => ({
  type: "abuse.spam",
  source: "abuseipdb",
  severity: "warning",
  confidence: 80,
  labels: {},
  repeatCount: 0,
  ...overrides,
});

describe("ruleMatches", () => {
  test("an unset column is not a condition", () => {
    // A rule carrying only a type glob is a catch-all for its namespace, not
    // something that matches nothing.
    expect(ruleMatches(makeRule(), input())).toBe(true);
  });

  test("matches the type glob", () => {
    expect(ruleMatches(makeRule({ matchType: "abuse.ddos" }), input())).toBe(
      false,
    );
    expect(ruleMatches(makeRule({ matchType: "abuse.spam" }), input())).toBe(
      true,
    );
  });

  test("restricts to one source when asked", () => {
    expect(
      ruleMatches(makeRule({ matchSource: "alertmanager" }), input()),
    ).toBe(false);
    expect(ruleMatches(makeRule({ matchSource: "abuseipdb" }), input())).toBe(
      true,
    );
  });

  test("applies a severity floor", () => {
    expect(
      ruleMatches(makeRule({ matchSeverityMin: "critical" }), input()),
    ).toBe(false);
    expect(ruleMatches(makeRule({ matchSeverityMin: "info" }), input())).toBe(
      true,
    );
  });

  test("a confidence floor needs a source that expresses one", () => {
    expect(
      ruleMatches(
        makeRule({ matchConfidenceMin: 50 }),
        input({ confidence: null }),
      ),
    ).toBe(false);
    expect(
      ruleMatches(
        makeRule({ matchConfidenceMin: 90 }),
        input({ confidence: 80 }),
      ),
    ).toBe(false);
    expect(
      ruleMatches(
        makeRule({ matchConfidenceMin: 50 }),
        input({ confidence: 80 }),
      ),
    ).toBe(true);
  });

  test("counts repeat offences", () => {
    expect(
      ruleMatches(
        makeRule({ matchRepeatCountMin: 2 }),
        input({ repeatCount: 1 }),
      ),
    ).toBe(false);
    expect(
      ruleMatches(
        makeRule({ matchRepeatCountMin: 2 }),
        input({ repeatCount: 3 }),
      ),
    ).toBe(true);
  });

  test("requires every declared label", () => {
    const withLabels = makeRule({ matchLabels: { job: "node", env: "prod" } });

    expect(ruleMatches(withLabels, input({ labels: { job: "node" } }))).toBe(
      false,
    );
    expect(
      ruleMatches(
        withLabels,
        input({ labels: { job: "node", env: "prod", extra: "ok" } }),
      ),
    ).toBe(true);
  });
});
