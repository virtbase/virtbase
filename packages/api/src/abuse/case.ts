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
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  not,
  notInArray,
  or,
  sql,
} from "@virtbase/db";
import type { db as database, Executor } from "@virtbase/db/client";
import type { AbuseCase, AbuseRule } from "@virtbase/db/schema";
import {
  abuseCaseEvents,
  abuseCaseServers,
  abuseCases,
} from "@virtbase/db/schema";
import type { SignalSeverity } from "@virtbase/ports";
import { dispatchNotification } from "../notifications/dispatch";
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

/** Settled. Nothing moves a case out of one of these except an operator. */
export const TERMINAL_STATUSES: CaseStatus[] = ["resolved", "rejected"];

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

/**
 * Resolutions that settle a case without holding the customer responsible.
 *
 * They are not offences and must never read as corroboration:
 * `match_repeat_count_min` is what lets a rule trust a third-party report on
 * the grounds that "we already settled something against this customer", and a
 * report we ourselves decided was wrong is the opposite of that. Counting them
 * would hand a malicious reporter the second half of a two-step - file once,
 * have it thrown out, file again and watch it enforce.
 */
const EXONERATING_RESOLUTIONS: NonNullable<AbuseCase["resolution"]>[] = [
  "false_positive",
  "not_our_range",
];

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
        // A resolved case with no reason recorded still counts: it was closed
        // against the customer, and `NOT IN` on a NULL would silently drop it.
        or(
          isNull(abuseCases.resolution),
          notInArray(abuseCases.resolution, EXONERATING_RESOLUTIONS),
        ),
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

/** How long a customer gets to answer when an operator hands a case over. */
export const DEFAULT_RESPONSE_HOURS = 24;

/**
 * Hands a case to the customer, and says so.
 *
 * Three things have to happen together or none of them should: the status
 * moves, a deadline is written, and the customer is told.
 *
 * A status with no deadline never escalates - `reconcileAbuseCases` matches on
 * `respond_by <= now()`, and NULL is never `<=` anything - so an operator who
 * moved a case to `awaiting_customer` and waited would wait forever. A
 * deadline with no notice is worse: it tightens enforcement over a silence
 * nobody asked the customer to break.
 *
 * `escalated_at` is cleared because a new deadline is a new chance to miss
 * one. The column exists to stop a single overdue case escalating again every
 * five minutes, not to spend the ladder on the first miss.
 *
 * A settled case is never handed back. `setCaseStatus` refuses to move one and
 * says why - "a late signal reopening a closed case behind an operator's back
 * is how an audit trail stops meaning anything" - and this writes the same
 * columns, so it owes the same guarantee. Without it, an operator answering a
 * customer's thank-you on a resolved case would set a live deadline on a row
 * that still carries `closed_at` and its last enforcement level; a day later
 * the escalation sweep would re-lock their servers one rung *above* what was
 * released, because `releaseCase` clears the per-server rows and leaves
 * `abuse_cases.enforcement` alone.
 *
 * The reason comes back rather than a bare false, because "nobody to ask" and
 * "already closed" need different answers on screen.
 */
export type AwaitCustomerResult =
  | { handed: true }
  | { handed: false; reason: "no_customer" | "settled" };

export const awaitCustomerResponse = async ({
  db,
  caseId,
  hours = DEFAULT_RESPONSE_HOURS,
}: {
  db: Database;
  caseId: string;
  hours?: number;
}): Promise<AwaitCustomerResult> => {
  const abuseCase = await db
    .select({
      number: abuseCases.number,
      userId: abuseCases.userId,
      category: abuseCases.category,
      status: abuseCases.status,
    })
    .from(abuseCases)
    .where(eq(abuseCases.id, caseId))
    .limit(1)
    .then(([first]) => first);

  if (!abuseCase) return { handed: false, reason: "no_customer" };
  if (TERMINAL_STATUSES.includes(abuseCase.status)) {
    return { handed: false, reason: "settled" };
  }
  if (!abuseCase.userId) return { handed: false, reason: "no_customer" };

  const [updated] = await db
    .update(abuseCases)
    .set({
      status: "awaiting_customer",
      respondBy: new Date(Date.now() + hours * 3_600_000),
      escalatedAt: null,
    })
    // Repeated in the predicate rather than trusted from the read above: the
    // notice below is an email, and a case closed in between must not get one.
    .where(
      and(
        eq(abuseCases.id, caseId),
        not(inArray(abuseCases.status, TERMINAL_STATUSES)),
      ),
    )
    .returning({ id: abuseCases.id });

  if (!updated) return { handed: false, reason: "settled" };

  await dispatchNotification({
    key: "abuse.case.notice",
    audience: { kind: "user", userId: abuseCase.userId },
    severity: "warning",
    // No group key: every hand-over is a new thing to answer, and collapsing
    // them onto the first would silently drop the conversation.
    url: `/abuse/${caseId}`,
    params: {
      reference: caseReference(abuseCase.number),
      category: abuseCase.category,
      deadlineHours: hours,
    },
  });

  return { handed: true };
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
        not(inArray(abuseCases.status, TERMINAL_STATUSES)),
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
