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

import { and, asc, desc, eq, isNotNull, like } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import { abuseRules, abuseSignals } from "@virtbase/db/schema";
import type { SignalSeverity } from "@virtbase/ports";
import { ABUSE_SIGNAL_PREFIX } from "@virtbase/validators";
import type { CaseDecision } from "./case";
import { countRecentResolvedCases, decideNewCase } from "./case";
import type { RuleDefinition } from "./rules";
import { ruleMatches } from "./rules";

type Database = typeof database;

/**
 * How many past signals a dry run replays.
 *
 * Enough that a weekly pattern shows up, small enough that the editor answers
 * while the operator is still looking at it.
 */
export const DRY_RUN_SIGNAL_LIMIT = 500;

/** How many matched signals come back with the counts. */
export const DRY_RUN_SAMPLE_LIMIT = 25;

/**
 * The draft sorts last on a priority tie.
 *
 * A tie is decided by id, and a rule that has never been saved has no id to
 * compare. Losing the tie is the conservative reading: the operator is told
 * their rule is shadowed and can raise its priority, rather than being
 * promised a win that a generated id might not deliver.
 */
const DRAFT_ID = "abrul_~draft";

export interface DryRunSample {
  signalId: string;
  source: string;
  type: string;
  severity: SignalSeverity;
  confidence: number | null;
  title: string;
  occurredAt: Date;
  occurrences: number;
  /** The address was reallocated since, so the draft would not enforce. */
  staleAttribution: boolean;
}

export interface DryRunShadow {
  ruleId: string;
  name: string;
  priority: number;
  count: number;
}

export interface DryRunResult {
  /** Signals replayed: the most recent ones that reached the matcher. */
  considered: number;
  /** Of those, how many the draft's conditions accept. */
  matched: number;
  /** Of the matches, how many the draft also wins on priority. */
  wins: number;
  /** Wins where the draft would actually have locked something. */
  enforcing: number;
  /** Wins the draft cannot act on because attribution had gone stale. */
  stale: number;
  /** Higher-priority rules that would take a matched signal first. */
  shadowedBy: DryRunShadow[];
  /** What a win does, for a signal whose attribution is sound. */
  decision: CaseDecision;
  samples: DryRunSample[];
}

/**
 * A rule as the editor holds it, before the database has filled anything in.
 *
 * `actionOpenCase` and `actionAutoCloseHours` are columns with defaults that
 * no form field writes yet, so a draft is not required to carry them. Keeping
 * them optional rather than adding them to `AbuseRuleInputSchema` is what
 * stops the create and update actions from writing values nobody chose.
 */
export type DryRunDraft = Omit<
  RuleDefinition,
  "id" | "actionOpenCase" | "actionAutoCloseHours"
> & {
  id?: string | null;
  actionOpenCase?: boolean;
  actionAutoCloseHours?: number | null;
};

/**
 * Replays a draft rule against the signals that have already arrived.
 *
 * A rule set is configuration that suspends people's servers, and the only
 * honest way to review one before saving it is against real traffic. This runs
 * the same {@link ruleMatches} and {@link decideNewCase} the pipeline runs, on
 * the same rows, and writes nothing.
 *
 * Two numbers matter more than the match count. `wins` is what the rule would
 * actually have decided - a rule that matches five hundred signals and wins
 * none is a rule sitting behind a catch-all. `enforcing` is how many customers
 * would have had a server locked without anyone reading the report.
 *
 * The replay is honest about one thing it cannot recover: a customer's repeat
 * count is read as it stands now, not as it stood when each signal arrived, so
 * a rule gated on `matchRepeatCountMin` reads slightly hot.
 */
export const dryRunAbuseRules = async ({
  db,
  draft,
  limit = DRY_RUN_SIGNAL_LIMIT,
  sampleLimit = DRY_RUN_SAMPLE_LIMIT,
}: {
  db: Database;
  /**
   * The rule being edited. Its stored twin, if any, is replaced by it.
   *
   * The columns the editor does not offer are optional here and filled in
   * below with what the database would store, so the caller can hand over
   * exactly what the form submits. Requiring them would mean the form owned
   * fields it does not show.
   */
  draft: DryRunDraft;
  limit?: number;
  sampleLimit?: number;
}): Promise<DryRunResult> => {
  // What the row would look like after saving, defaults included - the point
  // of the replay is the saved rule's behaviour, not the form's.
  const candidate: RuleDefinition = {
    ...draft,
    id: draft.id ?? DRAFT_ID,
    actionOpenCase: draft.actionOpenCase ?? true,
    actionAutoCloseHours: draft.actionAutoCloseHours ?? null,
  };

  const stored = await db
    .select()
    .from(abuseRules)
    .where(eq(abuseRules.enabled, true));

  // The draft as it would be after saving: its stored twin gone, itself in
  // place, and the whole set back in evaluation order.
  const effective = [
    ...stored.filter((rule) => rule.id !== candidate.id),
    ...(candidate.enabled ? [candidate] : []),
  ].sort(
    (a, b) =>
      a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const signals = await db
    .select({
      id: abuseSignals.id,
      source: abuseSignals.source,
      type: abuseSignals.type,
      severity: abuseSignals.severity,
      confidence: abuseSignals.confidence,
      labels: abuseSignals.labels,
      title: abuseSignals.title,
      occurredAt: abuseSignals.occurredAt,
      occurrences: abuseSignals.occurrences,
      attribution: abuseSignals.attribution,
      userId: abuseSignals.userId,
    })
    .from(abuseSignals)
    .where(
      and(
        like(abuseSignals.type, `${ABUSE_SIGNAL_PREFIX}%`),
        // Intake never reaches the matcher without a customer to hold
        // responsible, so replaying unattributed signals would inflate every
        // number on the page.
        isNotNull(abuseSignals.userId),
      ),
    )
    .orderBy(desc(abuseSignals.lastSeenAt), asc(abuseSignals.id))
    .limit(limit);

  const repeats = new Map<string, number>();
  const repeatCountFor = async (userId: string): Promise<number> => {
    const cached = repeats.get(userId);
    if (undefined !== cached) return cached;

    const count = await countRecentResolvedCases({ db, userId });
    repeats.set(userId, count);
    return count;
  };

  const shadows = new Map<string, DryRunShadow>();
  const samples: DryRunSample[] = [];
  let matched = 0;
  let wins = 0;
  let enforcing = 0;
  let stale = 0;

  for (const signal of signals) {
    if (!signal.userId) continue;

    const input = {
      type: signal.type,
      source: signal.source,
      severity: signal.severity,
      confidence: signal.confidence,
      labels: (signal.labels ?? {}) as Record<string, string>,
      repeatCount: await repeatCountFor(signal.userId),
    };

    if (!ruleMatches(candidate, input)) continue;
    matched += 1;

    const winner = effective.find((rule) => ruleMatches(rule, input));

    if (winner && winner.id !== candidate.id) {
      const seen = shadows.get(winner.id);
      if (seen) seen.count += 1;
      else {
        shadows.set(winner.id, {
          ruleId: winner.id,
          name: winner.name,
          priority: winner.priority,
          count: 1,
        });
      }
      continue;
    }

    // A disabled draft matches but decides nothing; it is not in `effective`,
    // so no winner at all means the draft is the only rule that would have
    // applied and cannot.
    if (!winner) continue;

    wins += 1;

    const staleAttribution = "stale" === signal.attribution;
    if (staleAttribution) stale += 1;

    const outcome = decideNewCase({ rule: candidate, staleAttribution });
    if ("none" !== outcome.enforcement) enforcing += 1;

    if (samples.length < sampleLimit) {
      samples.push({
        signalId: signal.id,
        source: signal.source,
        type: signal.type,
        severity: signal.severity,
        confidence: signal.confidence,
        title: signal.title,
        occurredAt: signal.occurredAt,
        occurrences: signal.occurrences,
        staleAttribution,
      });
    }
  }

  return {
    considered: signals.length,
    matched,
    wins,
    enforcing,
    stale,
    shadowedBy: [...shadows.values()].sort((a, b) => b.count - a.count),
    decision: decideNewCase({ rule: candidate, staleAttribution: false }),
    samples,
  };
};
