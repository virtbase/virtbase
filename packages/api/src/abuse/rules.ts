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

import { asc, eq } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import type { AbuseRule } from "@virtbase/db/schema";
import { abuseRules } from "@virtbase/db/schema";
import type { SignalSeverity } from "@virtbase/ports";
import { matchesKey, meetsSeverity } from "../notifications/match";

type Database = typeof database;

/**
 * A rule's columns without the bookkeeping ones.
 *
 * The matcher takes this rather than {@link AbuseRule} so the rules editor can
 * evaluate a draft nobody has saved yet against the same code the pipeline
 * runs. A stored row satisfies it.
 */
export type RuleDefinition = Omit<AbuseRule, "createdAt" | "updatedAt">;

export interface RuleMatchInput {
  type: string;
  source: string;
  severity: SignalSeverity;
  confidence: number | null;
  labels: Record<string, string>;
  /** Resolved cases this customer already has behind them. */
  repeatCount: number;
}

/**
 * Whether one rule applies to one signal.
 *
 * Every condition is an `AND`, and an unset column is not a condition. That is
 * what makes a rule with only `match_type` a catch-all for its namespace
 * rather than something that matches nothing.
 */
export const ruleMatches = (
  rule: RuleDefinition,
  input: RuleMatchInput,
): boolean => {
  if (!matchesKey(rule.matchType, input.type)) return false;

  if (rule.matchSource && rule.matchSource !== input.source) return false;

  if (
    rule.matchSeverityMin &&
    !meetsSeverity(rule.matchSeverityMin, input.severity)
  ) {
    return false;
  }

  if (null !== rule.matchConfidenceMin) {
    // A rule with a confidence floor is asking for a source that expresses
    // one. A signal with no confidence has not met it.
    if (null === input.confidence) return false;
    if (input.confidence < rule.matchConfidenceMin) return false;
  }

  if (
    null !== rule.matchRepeatCountMin &&
    input.repeatCount < rule.matchRepeatCountMin
  ) {
    return false;
  }

  const required = (rule.matchLabels ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(required)) {
    if (input.labels[key] !== String(value)) return false;
  }

  return true;
};

/**
 * The rule that decides what happens, or none.
 *
 * First match by priority wins, and the winner's id is written onto the
 * signal: a suspension has to be explainable by pointing at the rule that
 * caused it, months later, after the rule has been edited.
 *
 * Evaluated in memory rather than in SQL because the label subset test has no
 * good index anyway and the rule set is a page of configuration, not a table
 * that grows with the fleet.
 */
export const findMatchingRule = async ({
  db,
  input,
}: {
  db: Database;
  input: RuleMatchInput;
}): Promise<AbuseRule | null> => {
  const candidates = await db
    .select()
    .from(abuseRules)
    .where(eq(abuseRules.enabled, true))
    .orderBy(asc(abuseRules.priority), asc(abuseRules.id));

  return candidates.find((rule) => ruleMatches(rule, input)) ?? null;
};
