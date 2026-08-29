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

import { eq, sql } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import type { AbuseCase } from "@virtbase/db/schema";
import { abuseCases, abuseSignals } from "@virtbase/db/schema";
import type {
  InboundSignal,
  NotificationSeverity,
  SignalIngestResult,
} from "@virtbase/ports";
import { ABUSE_SIGNAL_PREFIX, InboundSignalSchema } from "@virtbase/validators";
import { dispatchNotification } from "../notifications/dispatch";
import {
  caseReference,
  countRecentResolvedCases,
  openOrJoinAbuseCase,
  recordCaseEvent,
  setCaseStatus,
} from "./case";
import { ensureCaseMailbox } from "./mailbox/send";
import { resolveSignalSubject } from "./resolve-subject";
import { findMatchingRule } from "./rules";
import {
  sanitizeAbuseBody,
  sanitizeAbuseText,
  sanitizeAbuseTitle,
} from "./sanitize";

type Database = typeof database;
type CaseCategory = AbuseCase["category"];

const CATEGORIES = new Set<string>([
  "spam",
  "phishing",
  "malware",
  "port_scan",
  "ddos",
  "copyright",
  "compromised",
  "other",
]);

/** `abuse.port_scan` names its own category; anything else is `other`. */
const categoryFromType = (type: string): CaseCategory => {
  const suffix = type.slice(ABUSE_SIGNAL_PREFIX.length);
  return CATEGORIES.has(suffix) ? (suffix as CaseCategory) : "other";
};

const NOTIFICATION_SEVERITY: Record<
  AbuseCase["severity"],
  NotificationSeverity
> = {
  low: "info",
  medium: "warning",
  high: "warning",
  critical: "critical",
};

export interface SubmitSignalParams {
  db: Database;
  signal: InboundSignal;
}

/**
 * The single write path into the abuse pipeline.
 *
 * Every source goes through here - a webhook, a poll, the mailbox, an
 * operator - so deduplication, sanitisation, attribution and rule evaluation
 * are written once and cannot drift between them.
 *
 * Phase boundary: this decides what should happen to a case and records it on
 * the row. Nothing is applied to a server here; `enforce_at` and `enforcement`
 * are read by the enforcer, which is a separate concern with a separate
 * failure mode.
 */
export const submitSignal = async ({
  db,
  signal,
}: SubmitSignalParams): Promise<SignalIngestResult> => {
  // Validated even though the port types it: the value reached us from a
  // webhook, and a type is not a runtime guarantee.
  const parsed = InboundSignalSchema.parse(signal);

  const title = sanitizeAbuseTitle(parsed.title) ?? parsed.type;
  const body = sanitizeAbuseBody(parsed.body ?? null);

  // A source that claims the future would be attributed against an allocation
  // table that does not exist yet.
  const occurredAt =
    parsed.occurredAt.getTime() > Date.now() ? new Date() : parsed.occurredAt;

  const subjectValue =
    "none" === parsed.subject.kind
      ? null
      : "vm" === parsed.subject.kind
        ? // Both halves, because a vmid on its own identifies nothing.
          `${parsed.subject.node}/${parsed.subject.value}`
        : parsed.subject.value;

  const [row] = await db
    .insert(abuseSignals)
    .values({
      source: parsed.source,
      externalId: parsed.externalId,
      type: parsed.type,
      state: parsed.state,
      severity: parsed.severity,
      subjectKind: parsed.subject.kind,
      subjectValue,
      title,
      body,
      labels: parsed.labels ?? {},
      confidence: parsed.confidence ?? null,
      reporterName: sanitizeAbuseText(parsed.reporter?.name, {
        maxLength: 200,
      }),
      reporterEmail: parsed.reporter?.email ?? null,
      reporterOrganization: sanitizeAbuseText(parsed.reporter?.organization, {
        maxLength: 200,
      }),
      raw: parsed.raw ?? null,
      occurredAt,
    })
    // The deduplication latch. Alertmanager re-sends a still-firing alert every
    // `repeat_interval`, and without this each repeat would be a new case.
    .onConflictDoUpdate({
      target: [abuseSignals.source, abuseSignals.externalId],
      set: {
        state: parsed.state,
        severity: parsed.severity,
        title,
        body,
        lastSeenAt: sql`now()`,
        occurrences: sql`${abuseSignals.occurrences} + 1`,
      },
    })
    .returning();

  if (!row) throw new Error("Failed to record signal");

  const deduplicated = row.occurrences > 1;

  // The source says the condition has cleared. Recording that is the whole
  // job; releasing whatever it caused is the enforcer's, and it reads this.
  if ("resolved" === parsed.state) {
    await db
      .update(abuseSignals)
      .set({ resolvedAt: sql`now()` })
      .where(eq(abuseSignals.id, row.id));

    return { signalId: row.id, deduplicated };
  }

  const subject = await resolveSignalSubject({
    db,
    subject: parsed.subject,
    occurredAt,
  });

  await db
    .update(abuseSignals)
    .set({
      attribution: subject.attribution,
      serverId: subject.serverId,
      userId: subject.userId,
    })
    .where(eq(abuseSignals.id, row.id));

  // Everything that is not abuse is recorded and announced, and opens no case:
  // a node at 95% disk is not a dispute with a customer.
  if (!parsed.type.startsWith(ABUSE_SIGNAL_PREFIX)) {
    await notifyOperators({
      key: parsed.type,
      severity: parsed.severity,
      title,
      body,
      groupKey: `signal:${row.id}`,
    });
    return { signalId: row.id, deduplicated };
  }

  if (!subject.userId) {
    // An abuse report nobody can be held responsible for is exactly the kind a
    // human has to look at, so it is louder rather than quieter.
    await notifyOperators({
      key: "abuse.signal.unattributed",
      severity: "warning",
      title,
      body,
      groupKey: `signal:${row.id}`,
      params: {
        subject: subjectValue,
        attribution: subject.attribution,
        source: parsed.source,
      },
    });
    return { signalId: row.id, deduplicated };
  }

  // Already filed. A repeat of a known signal must not re-open the case it
  // already caused, or a flapping alert would notify on every repeat.
  if (row.caseId && deduplicated) {
    return { signalId: row.id, deduplicated, caseId: row.caseId };
  }

  const repeatCount = await countRecentResolvedCases({
    db,
    userId: subject.userId,
  });

  const rule = await findMatchingRule({
    db,
    input: {
      type: parsed.type,
      source: parsed.source,
      severity: parsed.severity,
      confidence: parsed.confidence ?? null,
      labels: parsed.labels ?? {},
      repeatCount,
    },
  });

  const category = rule?.actionCategory ?? categoryFromType(parsed.type);

  const opened = await openOrJoinAbuseCase({
    db,
    userId: subject.userId,
    serverId: subject.serverId,
    category,
    signalSeverity: parsed.severity,
    title,
    summary: body,
    staleAttribution: "stale" === subject.attribution,
    rule,
  });

  await db
    .update(abuseSignals)
    .set({ caseId: opened.caseId, matchedRuleId: rule?.id ?? null })
    .where(eq(abuseSignals.id, row.id));

  await recordCaseEvent({
    db,
    caseId: opened.caseId,
    type: "signal.attached",
    actorKind: "source",
    metadata: {
      signalId: row.id,
      source: parsed.source,
      attribution: subject.attribution,
      ...(subject.currentServerId
        ? { currentServerId: subject.currentServerId }
        : {}),
    },
  });

  const details = await db
    .select({
      number: abuseCases.number,
      severity: abuseCases.severity,
      status: abuseCases.status,
    })
    .from(abuseCases)
    .where(eq(abuseCases.id, opened.caseId))
    .limit(1)
    .then(([first]) => first);

  // Minted here rather than at insert: the human number is generated by the
  // database, and every message about the case has to carry the address a
  // reply comes back on.
  await ensureCaseMailbox({ db, caseId: opened.caseId }).catch(() => undefined);

  const reference = caseReference(details?.number ?? 0);
  const severity = NOTIFICATION_SEVERITY[details?.severity ?? "medium"];
  const groupKey = `abuse:${opened.caseId}`;

  await notifyOperators({
    key: opened.created ? "abuse.case.opened" : "abuse.case.updated",
    severity,
    title,
    body,
    groupKey,
    url: `/abuse/${opened.caseId}`,
    params: {
      reference,
      category,
      status: opened.status,
      attribution: subject.attribution,
      source: parsed.source,
    },
  });

  if (opened.notifyUser) {
    await dispatchNotification({
      // A distinct key from the operator one: "a case opened" and "you have
      // been told about it" are different events, go to different people, and
      // a target subscribing to `abuse.*` should be able to tell them apart.
      key: "abuse.case.notice",
      audience: { kind: "user", userId: subject.userId },
      severity,
      groupKey,
      url: `/abuse/${opened.caseId}`,
      params: { reference, category, deadlineHours: opened.responseHours },
    }).catch(() => undefined);

    // The customer has been told, so the clock they are being held to starts.
    // Started on dispatch rather than on delivery: whether the message landed
    // is the delivery log's question, and a channel outage must not silently
    // give somebody an unlimited window.
    await setCaseStatus({
      db,
      caseId: opened.caseId,
      status: "awaiting_customer",
      actorKind: "system",
      extra: {
        respondBy: new Date(Date.now() + opened.responseHours * 3_600_000),
      },
      metadata: { reason: "notice_sent" },
    });
  }

  return {
    signalId: row.id,
    deduplicated,
    caseId: opened.caseId,
    enforcement: opened.enforcement,
  };
};

const notifyOperators = async ({
  key,
  severity,
  title,
  body,
  groupKey,
  url,
  params = {},
}: {
  key: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  groupKey: string;
  url?: string;
  params?: Record<string, string | number | boolean | null>;
}): Promise<void> => {
  await dispatchNotification({
    key,
    audience: { kind: "operator" },
    severity,
    groupKey,
    ...(url ? { url } : {}),
    params: { ...params, title, body },
  }).catch(() => undefined);
};

/** Submits several signals from one poll. */
export const submitSignals = async ({
  db,
  signals,
}: {
  db: Database;
  signals: InboundSignal[];
}): Promise<SignalIngestResult[]> => {
  const results: SignalIngestResult[] = [];

  // Sequential on purpose: two reports about the same customer arriving in the
  // same batch must see each other's case, or the join window never applies.
  for (const signal of signals) {
    results.push(await submitSignal({ db, signal }));
  }

  return results;
};
