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

import { caseReference } from "@virtbase/api/abuse";
import { asc, desc, eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import type { AbuseCase } from "@virtbase/db/schema";
import {
  abuseCaseContacts,
  abuseCaseEvents,
  abuseCaseMessages,
  abuseCaseServers,
  abuseCases,
  abuseSignals,
  servers,
  users,
} from "@virtbase/db/schema";
import { verifySession } from "../verify-session";

export interface AbuseCaseDetail {
  id: string;
  reference: string;
  title: string;
  summary: string | null;
  category: AbuseCase["category"];
  severity: AbuseCase["severity"];
  status: AbuseCase["status"];
  enforcement: AbuseCase["enforcement"];
  staleAttribution: boolean;
  blocksOrdering: boolean;
  respondBy: Date | null;
  /** True when the customer's deadline has passed without an answer. */
  overdue: boolean;
  /** Null while a case from the mailbox is still in triage. */
  customer: { id: string; name: string; email: string } | null;
  serverCount: number;
  signalCount: number;
  createdAt: Date;
  updatedAt: Date;
  enforceAt: Date | null;
  enforcedAt: Date | null;
  observeUntil: Date | null;
  resolution: AbuseCase["resolution"];
  closedAt: Date | null;
  servers: {
    serverId: string;
    serverName: string;
    lockLevel: AbuseCase["enforcement"];
    lockedAt: Date | null;
    releasedAt: Date | null;
  }[];
  signals: {
    id: string;
    source: string;
    type: string;
    severity: string;
    attribution: string;
    subject: string | null;
    title: string;
    body: string | null;
    confidence: number | null;
    reporter: string | null;
    occurrences: number;
    occurredAt: Date;
  }[];
  messages: {
    id: string;
    author: string;
    audience: "customer" | "internal" | "reporter";
    body: string;
    createdAt: Date;
  }[];
  contacts: {
    email: string;
    name: string | null;
    kind: string;
    acknowledgedAt: Date | null;
  }[];
  events: {
    id: string;
    type: string;
    actorKind: string;
    fromValue: string | null;
    toValue: string | null;
    createdAt: Date;
  }[];
}

/** Everything the case page renders. Operators see the unredacted record. */
export async function getAbuseCase(
  caseId: string,
): Promise<AbuseCaseDetail | null> {
  await verifySession();

  const row = await db
    .select({
      id: abuseCases.id,
      number: abuseCases.number,
      title: abuseCases.title,
      summary: abuseCases.summary,
      category: abuseCases.category,
      severity: abuseCases.severity,
      status: abuseCases.status,
      enforcement: abuseCases.enforcement,
      enforceAt: abuseCases.enforceAt,
      enforcedAt: abuseCases.enforcedAt,
      observeUntil: abuseCases.observeUntil,
      staleAttribution: abuseCases.staleAttribution,
      blocksOrdering: abuseCases.blocksOrdering,
      respondBy: abuseCases.respondBy,
      resolution: abuseCases.resolution,
      closedAt: abuseCases.closedAt,
      createdAt: abuseCases.createdAt,
      updatedAt: abuseCases.updatedAt,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
    })
    .from(abuseCases)
    // Left, not inner: a case opened from the mailbox has no customer until
    // somebody reads it and says whose it is.
    .leftJoin(users, eq(users.id, abuseCases.userId))
    .where(eq(abuseCases.id, caseId))
    .limit(1)
    .then(([first]) => first);

  if (!row) return null;

  const [affected, signals, messages, events, contacts] = await Promise.all([
    db
      .select({
        serverId: abuseCaseServers.serverId,
        serverName: servers.name,
        lockLevel: abuseCaseServers.lockLevel,
        lockedAt: abuseCaseServers.lockedAt,
        releasedAt: abuseCaseServers.releasedAt,
      })
      .from(abuseCaseServers)
      .innerJoin(servers, eq(servers.id, abuseCaseServers.serverId))
      .where(eq(abuseCaseServers.caseId, caseId)),
    db
      .select({
        id: abuseSignals.id,
        source: abuseSignals.source,
        type: abuseSignals.type,
        severity: abuseSignals.severity,
        attribution: abuseSignals.attribution,
        subject: abuseSignals.subjectValue,
        title: abuseSignals.title,
        body: abuseSignals.body,
        confidence: abuseSignals.confidence,
        reporterName: abuseSignals.reporterName,
        reporterEmail: abuseSignals.reporterEmail,
        occurrences: abuseSignals.occurrences,
        occurredAt: abuseSignals.occurredAt,
      })
      .from(abuseSignals)
      .where(eq(abuseSignals.caseId, caseId))
      .orderBy(desc(abuseSignals.occurredAt)),
    db
      .select({
        id: abuseCaseMessages.id,
        author: abuseCaseMessages.authorKind,
        audience: abuseCaseMessages.audience,
        body: abuseCaseMessages.body,
        createdAt: abuseCaseMessages.createdAt,
      })
      .from(abuseCaseMessages)
      .where(eq(abuseCaseMessages.caseId, caseId))
      .orderBy(asc(abuseCaseMessages.createdAt)),
    db
      .select({
        id: abuseCaseEvents.id,
        type: abuseCaseEvents.type,
        actorKind: abuseCaseEvents.actorKind,
        fromValue: abuseCaseEvents.fromValue,
        toValue: abuseCaseEvents.toValue,
        createdAt: abuseCaseEvents.createdAt,
      })
      .from(abuseCaseEvents)
      .where(eq(abuseCaseEvents.caseId, caseId))
      .orderBy(desc(abuseCaseEvents.createdAt))
      .limit(100),
    db
      .select({
        email: abuseCaseContacts.email,
        name: abuseCaseContacts.name,
        kind: abuseCaseContacts.kind,
        acknowledgedAt: abuseCaseContacts.acknowledgedAt,
      })
      .from(abuseCaseContacts)
      .where(eq(abuseCaseContacts.caseId, caseId)),
  ]);

  return {
    id: row.id,
    reference: caseReference(row.number),
    title: row.title,
    summary: row.summary,
    category: row.category,
    severity: row.severity,
    status: row.status,
    enforcement: row.enforcement,
    enforceAt: row.enforceAt,
    enforcedAt: row.enforcedAt,
    observeUntil: row.observeUntil,
    staleAttribution: row.staleAttribution,
    blocksOrdering: row.blocksOrdering,
    respondBy: row.respondBy,
    overdue: Boolean(row.respondBy && row.respondBy.getTime() < Date.now()),
    resolution: row.resolution,
    closedAt: row.closedAt,
    customer:
      row.userId && row.userName && row.userEmail
        ? { id: row.userId, name: row.userName, email: row.userEmail }
        : null,
    serverCount: affected.length,
    signalCount: signals.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    servers: affected,
    signals: signals.map(({ reporterName, reporterEmail, ...signal }) => ({
      ...signal,
      reporter:
        [reporterName, reporterEmail].filter(Boolean).join(" · ") || null,
    })),
    messages,
    events,
    contacts,
  };
}
