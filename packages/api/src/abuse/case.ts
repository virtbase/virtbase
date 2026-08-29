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

import { and, desc, eq, gte, inArray, not, sql } from "@virtbase/db";
import type { db as database, Executor } from "@virtbase/db/client";
import type { AbuseCase, AbuseRule } from "@virtbase/db/schema";
import {
  abuseCaseEvents,
  abuseCaseServers,
  abuseCases,
} from "@virtbase/db/schema";
import type { SignalSeverity } from "@virtbase/ports";
import type { RuleDefinition } from "./rules";

type Database = typeof database;

type CaseSeverity = AbuseCase["severity"];
type CaseCategory = AbuseCase["category"];
type CaseStatus = AbuseCase["status"];

/**
 * How long a new report is folded into an existing case.
 *
 * Long enough that a sustained port scan is one conversation rather than
 * forty, short enough that next month's incident is not filed under last
 * month's.
 */
export const CASE_JOIN_WINDOW_HOURS = 72;

/** How far back a customer's history counts against them in rule matching. */
export const REPEAT_WINDOW_DAYS = 90;

const SEVERITY_RANK: Record<CaseSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** A signal's severity is coarser than a case's; this is the neutral reading. */
const FROM_SIGNAL: Record<SignalSeverity, CaseSeverity> = {
  info: "low",
  warning: "medium",
  critical: "critical",
};

/** Cases that can still absorb a new signal. */
const LIVE_STATUSES: CaseStatus[] = [
  "triage",
  "open",
  "awaiting_customer",
  "awaiting_operator",
  "mitigated",
];

export interface RecordCaseEventInput {
  /** Takes a transaction too, so a caller can make its writes atomic. */
  db: Executor;
  caseId: string;
  type: string;
  actorKind: "customer" | "operator" | "system" | "source";
  actorUserId?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Appends to the audit trail.
 *
 * Called unconditionally rather than on interesting changes only: the value of
 * this table is that it is complete, and a decision about what was worth
 * recording is made once, here, rather than at forty call sites.
 */
export const recordCaseEvent = async ({
  db,
  caseId,
  type,
  actorKind,
  actorUserId = null,
  fromValue = null,
  toValue = null,
  metadata = {},
}: RecordCaseEventInput): Promise<void> => {
  await db.insert(abuseCaseEvents).values({
    caseId,
    type,
    actorKind,
    actorUserId,
    fromValue,
    toValue,
    metadata,
  });
};

/** How many settled cases this customer already has behind them. */
export const countRecentResolvedCases = async ({
  db,
  userId,
}: {
  db: Database;
  userId: string;
}): Promise<number> => {
  const since = new Date(Date.now() - REPEAT_WINDOW_DAYS * 86_400_000);

  const rows = await db
    .select({ id: abuseCases.id })
    .from(abuseCases)
    .where(
      and(
        eq(abuseCases.userId, userId),
        eq(abuseCases.status, "resolved"),
        gte(abuseCases.createdAt, since),
      ),
    );

  return rows.length;
};

/** What a rule - or the absence of one - does to a case that is about to open. */
export interface CaseDecision {
  status: CaseStatus;
  enforcement: AbuseCase["enforcement"];
  blocksOrdering: boolean;
  notifyUser: boolean;
  responseHours: number;
  graceMinutes: number;
}

/**
 * The whole of what a matched rule is allowed to cause.
 *
 * Its own function because the rules editor's dry run has to answer "what
 * would this rule do" with the same code the pipeline runs, not a second
 * reading of the same columns that drifts the first time one is added.
 *
 * Only a rule that has been explicitly trusted may open a case that acts.
 * Everything else waits for a human, which is what stops a competitor's
 * plausible report from suspending a customer. Stale attribution disarms even
 * a trusted rule: the address may belong to somebody else by now.
 */
export const decideNewCase = ({
  rule,
  staleAttribution,
}: {
  rule: RuleDefinition | null;
  staleAttribution: boolean;
}): CaseDecision => {
  const trusted = Boolean(rule?.trustedSource);

  return {
    status: trusted ? "open" : "triage",
    enforcement:
      trusted && !staleAttribution
        ? (rule?.actionEnforcement ?? "none")
        : "none",
    blocksOrdering: trusted ? (rule?.actionBlockOrders ?? false) : false,
    notifyUser: trusted && (rule?.actionNotifyUser ?? true),
    responseHours: rule?.actionResponseHours ?? 24,
    graceMinutes: rule?.actionGraceMinutes ?? 0,
  };
};

export interface OpenOrJoinCaseInput {
  db: Database;
  userId: string;
  serverId: string | null;
  category: CaseCategory;
  signalSeverity: SignalSeverity;
  title: string;
  summary: string | null;
  staleAttribution: boolean;
  rule: AbuseRule | null;
}

export interface OpenOrJoinCaseResult {
  caseId: string;
  created: boolean;
  status: CaseStatus;
  /** What the case intends to do. Applying it is the enforcer's job. */
  enforcement: AbuseCase["enforcement"];
  notifyUser: boolean;
  responseHours: number;
}

/**
 * Files a signal against a case, opening one only when it has to.
 *
 * A case is one dispute with one customer, so a second report about the same
 * category inside the join window joins rather than starting a parallel
 * conversation the customer would receive twice.
 */
export const openOrJoinAbuseCase = async ({
  db,
  userId,
  serverId,
  category,
  signalSeverity,
  title,
  summary,
  staleAttribution,
  rule,
}: OpenOrJoinCaseInput): Promise<OpenOrJoinCaseResult> => {
  const severity: CaseSeverity =
    rule?.actionCaseSeverity ?? FROM_SIGNAL[signalSeverity];

  const since = new Date(Date.now() - CASE_JOIN_WINDOW_HOURS * 3_600_000);

  const existing = await db
    .select()
    .from(abuseCases)
    .where(
      and(
        eq(abuseCases.userId, userId),
        eq(abuseCases.category, category),
        inArray(abuseCases.status, LIVE_STATUSES),
        gte(abuseCases.createdAt, since),
      ),
    )
    .orderBy(desc(abuseCases.createdAt))
    .limit(1)
    .then(([first]) => first);

  if (existing) {
    // A signal arriving against a case the customer said they had fixed means
    // they had not. It goes back to open at the level it was already at,
    // rather than starting the process over from triage.
    const reopened = "mitigated" === existing.status;
    const raised = SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity];

    if (reopened || raised) {
      await db
        .update(abuseCases)
        .set({
          ...(reopened ? { status: "open" as const, observeUntil: null } : {}),
          ...(raised ? { severity } : {}),
        })
        .where(eq(abuseCases.id, existing.id));

      if (reopened) {
        await recordCaseEvent({
          db,
          caseId: existing.id,
          type: "status.changed",
          actorKind: "system",
          fromValue: existing.status,
          toValue: "open",
          metadata: { reason: "signal_after_mitigation" },
        });
      }

      if (raised) {
        await recordCaseEvent({
          db,
          caseId: existing.id,
          type: "severity.raised",
          actorKind: "system",
          fromValue: existing.severity,
          toValue: severity,
        });
      }
    }

    if (serverId) await linkCaseServer({ db, caseId: existing.id, serverId });

    return {
      caseId: existing.id,
      created: false,
      status: reopened ? "open" : existing.status,
      enforcement: existing.enforcement,
      notifyUser: reopened,
      responseHours: rule?.actionResponseHours ?? 24,
    };
  }

  const decision = decideNewCase({ rule, staleAttribution });
  const { status, enforcement, graceMinutes } = decision;

  const [created] = await db
    .insert(abuseCases)
    .values({
      userId,
      category,
      severity,
      status,
      title,
      summary,
      enforcement,
      enforceAt:
        "none" === enforcement
          ? null
          : new Date(Date.now() + graceMinutes * 60_000),
      blocksOrdering: decision.blocksOrdering,
      staleAttribution,
    })
    .returning({ id: abuseCases.id });

  if (!created) throw new Error("Failed to open abuse case");

  await recordCaseEvent({
    db,
    caseId: created.id,
    type: "case.opened",
    actorKind: rule ? "system" : "source",
    toValue: status,
    metadata: {
      ...(rule ? { ruleId: rule.id, ruleName: rule.name } : {}),
      ...(staleAttribution ? { staleAttribution: true } : {}),
    },
  });

  if (serverId) await linkCaseServer({ db, caseId: created.id, serverId });

  return {
    caseId: created.id,
    created: true,
    status,
    enforcement,
    notifyUser: decision.notifyUser,
    responseHours: decision.responseHours,
  };
};

/** Records that a case implicates a server. Idempotent. */
export const linkCaseServer = async ({
  db,
  caseId,
  serverId,
}: {
  db: Database;
  caseId: string;
  serverId: string;
}): Promise<void> => {
  await db
    .insert(abuseCaseServers)
    .values({ caseId, serverId })
    .onConflictDoNothing({
      target: [abuseCaseServers.caseId, abuseCaseServers.serverId],
    });
};

/**
 * Moves a case to a new status and records why.
 *
 * Refuses to move a settled case: `resolved` and `rejected` are terminal, and
 * a late signal reopening a closed case behind an operator's back is how an
 * audit trail stops meaning anything.
 */
export const setCaseStatus = async ({
  db,
  caseId,
  status,
  actorKind,
  actorUserId = null,
  metadata,
  extra,
}: {
  db: Database;
  caseId: string;
  status: CaseStatus;
  actorKind: RecordCaseEventInput["actorKind"];
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
  extra?: Partial<typeof abuseCases.$inferInsert>;
}): Promise<boolean> => {
  const [updated] = await db
    .update(abuseCases)
    .set({ status, ...extra })
    .where(
      and(
        eq(abuseCases.id, caseId),
        not(inArray(abuseCases.status, ["resolved", "rejected"])),
      ),
    )
    .returning({ id: abuseCases.id, status: abuseCases.status });

  if (!updated) return false;

  await recordCaseEvent({
    db,
    caseId,
    type: "status.changed",
    actorKind,
    actorUserId,
    toValue: status,
    ...(metadata ? { metadata } : {}),
  });

  return true;
};

/** The human reference, as it appears in email subjects and on both consoles. */
export const caseReference = (numberValue: number): string =>
  `AB-${numberValue}`;

export const touchCase = async ({
  db,
  caseId,
}: {
  db: Database;
  caseId: string;
}): Promise<void> => {
  await db
    .update(abuseCases)
    .set({ updatedAt: sql`now()` })
    .where(eq(abuseCases.id, caseId));
};
