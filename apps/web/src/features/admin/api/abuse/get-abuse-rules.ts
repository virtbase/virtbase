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

import { asc, count, isNotNull, max } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import type { AbuseRule } from "@virtbase/db/schema";
import { abuseRules, abuseSignals } from "@virtbase/db/schema";
import { verifySession } from "../verify-session";

export interface AbuseRuleListItem extends AbuseRule {
  /** Signals this rule has actually decided since it was created. */
  matchCount: number;
  lastMatchedAt: Date | null;
}

export interface AbuseRulesSettings {
  rules: AbuseRuleListItem[];
  /** Sources that have actually sent something, for the match-source field. */
  knownSources: string[];
  /**
   * True when no enabled rule may enforce.
   *
   * Worth its own flag rather than a count the page has to derive: it is the
   * difference between an abuse desk that acts and one where every report
   * waits for somebody to notice it, and a fresh database is in the second
   * state without saying so anywhere.
   */
  noTrustedRule: boolean;
}

/** Everything the rules page renders. */
export async function getAbuseRules(): Promise<AbuseRulesSettings> {
  await verifySession();

  const [rules, matches, sources] = await Promise.all([
    db
      .select()
      .from(abuseRules)
      .orderBy(asc(abuseRules.priority), asc(abuseRules.id)),
    db
      .select({
        ruleId: abuseSignals.matchedRuleId,
        matchCount: count(),
        lastMatchedAt: max(abuseSignals.lastSeenAt),
      })
      .from(abuseSignals)
      .where(isNotNull(abuseSignals.matchedRuleId))
      .groupBy(abuseSignals.matchedRuleId),
    db
      .selectDistinct({ source: abuseSignals.source })
      .from(abuseSignals)
      .orderBy(asc(abuseSignals.source)),
  ]);

  const stats = new Map(matches.map((row) => [row.ruleId, row]));

  return {
    rules: rules.map((rule) => ({
      ...rule,
      matchCount: stats.get(rule.id)?.matchCount ?? 0,
      lastMatchedAt: stats.get(rule.id)?.lastMatchedAt ?? null,
    })),
    knownSources: sources.map((row) => row.source),
    noTrustedRule: !rules.some((rule) => rule.enabled && rule.trustedSource),
  };
}
