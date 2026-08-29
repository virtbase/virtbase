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

import { sql } from "drizzle-orm";
import * as d from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";
import { abuseCases } from "./abuse-cases";
import {
  signalAttributionEnum,
  signalSeverityEnum,
  signalStateEnum,
  signalSubjectKindEnum,
} from "./abuse-enums";
import { abuseRules } from "./abuse-rules";
import { users } from "./auth";
import { servers } from "./servers";

/**
 * Every normalised inbound signal, from every source, kept.
 *
 * One table for abuse reports, Alertmanager alerts and the platform's own
 * conditions, because they are the same thing arriving through the same door
 * with a different `type`. The `abuse.` prefix is what routes one into the
 * case pipeline.
 */
export const abuseSignals = d.snakeCase.table(
  "abuse_signals",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "absig_" })),
    /** Integration id, or `manual` / `internal` for our own. */
    source: d.text().notNull(),
    /**
     * Source-scoped identity. With {@link source} it forms the deduplication
     * key, and ingest is an upsert on it - which is what makes Alertmanager
     * re-sending a still-firing alert every `repeat_interval` harmless.
     */
    externalId: d.text().notNull(),
    /** Dotted, e.g. `abuse.spam`, `node.disk_pressure`. */
    type: d.text().notNull(),
    state: signalStateEnum().notNull().default("firing"),
    severity: signalSeverityEnum().notNull(),
    subjectKind: signalSubjectKindEnum().notNull(),
    /** The address, id or hostname the source named. Null for `none`. */
    subjectValue: d.text(),
    /** Sanitised at ingest. Safe to render. */
    title: d.text().notNull(),
    /**
     * [!] Untrusted. Verbatim reporter text, kept for the case record.
     *
     * Same trust level as `servers.detected_os_name`: stored only after
     * sanitising, and escaped again at any sink that interprets markup.
     *
     * @default null
     */
    body: d.text(),
    /** Low-cardinality routing labels. Never PII. */
    labels: d.jsonb().notNull().default({}),
    /** 0-100 where the source expresses one. */
    confidence: d.integer(),
    /** [!] Untrusted. Never shown to the customer. */
    reporterName: d.text(),
    /** [!] Untrusted. Never shown to the customer. */
    reporterEmail: d.text(),
    /** [!] Untrusted. Never shown to the customer. */
    reporterOrganization: d.text(),
    /** The provider payload as received, for the evidence trail. */
    raw: d.jsonb(),
    /**
     * When the reported thing happened, as the source dates it.
     *
     * Attribution reads the allocation table as it stood at this instant, not
     * at ingest: a report that arrives three days late must not be pinned on
     * whoever holds the address today.
     */
    occurredAt: d.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    firstSeenAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    lastSeenAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    /** How many times this same signal has arrived. */
    occurrences: d.integer().notNull().default(1),
    /** When the source said the condition had cleared. */
    resolvedAt: d.timestamp({ withTimezone: true, mode: "date" }),

    attribution: signalAttributionEnum().notNull().default("unattributed"),
    serverId: d.text().references(() => servers.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * Cascades rather than nulling: a signal attributed to a customer is
     * about that customer, and the erasure map declares it erased. Signals
     * that were never attributed, or that concern a node rather than a
     * person, carry NULL here and are untouched by an account deletion.
     */
    userId: d.text().references(() => users.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    caseId: d.text().references(() => abuseCases.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** The rule that decided what happened. Null when nothing matched. */
    matchedRuleId: d.text().references(() => abuseRules.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [
    // The deduplication latch. Ingest is an upsert on this.
    d.unique().on(t.source, t.externalId),
    d.index().on(t.caseId),
    d.index().on(t.serverId),
    d.index().on(t.userId),
    d.index().on(t.type),
    d.index().on(t.subjectKind, t.subjectValue),
    d.index().on(t.state, t.severity),
    d.index().on(t.lastSeenAt),
  ],
);

export type AbuseSignal = typeof abuseSignals.$inferSelect;
