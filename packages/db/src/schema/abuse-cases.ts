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
import {
  abuseCaseResolutionEnum,
  abuseCaseSeverityEnum,
  abuseCaseStatusEnum,
  abuseCategoryEnum,
  abuseContactKindEnum,
  abuseEnforcementLevelEnum,
  abuseEventActorEnum,
  abuseMessageAudienceEnum,
  abuseMessageAuthorEnum,
} from "./abuse-enums";
import { users } from "./auth";
import { emails } from "./emails";
import { servers } from "./servers";

/**
 * One dispute with one customer.
 *
 * A case, not a report: several reports about the same customer and the same
 * category collapse into one, which is what stops a sustained port scan from
 * opening forty cases and sending forty emails.
 */
export const abuseCases = d.snakeCase.table(
  "abuse_cases",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "abus_" })),
    /**
     * The number people use. Rendered as `AB-1042` in email subjects, in the
     * case mailbox address and on both consoles.
     *
     * A separate identity column rather than the id, because a reporter has to
     * be able to read it over the phone and type it back.
     */
    number: d.integer().generatedAlwaysAsIdentity(),
    /**
     * The customer the case is about, once we know.
     *
     * Nullable because a report can arrive before anyone can say whose it is:
     * a stranger emails `abuse@` about an address, and until somebody reads it
     * the case is real, in `triage`, and belongs to nobody. Inventing a
     * customer to satisfy a constraint would be worse than admitting that.
     *
     * A case with no customer can never enforce - there is nothing to enforce
     * against - and never notifies one.
     */
    userId: d.text().references(() => users.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    category: abuseCategoryEnum().notNull(),
    severity: abuseCaseSeverityEnum().notNull(),
    status: abuseCaseStatusEnum().notNull().default("triage"),
    title: d.text().notNull(),
    summary: d.text(),
    /**
     * The level this case intends to enforce. What is actually applied to each
     * machine lives on {@link abuseCaseServers} - a case can be part-way
     * through applying, or through releasing.
     */
    enforcement: abuseEnforcementLevelEnum().notNull().default("none"),
    /**
     * When enforcement may be applied.
     *
     * The grace window. Anything below `critical` gives the customer a chance
     * to act on the notice before their server is touched, and a case settled
     * inside the window is never enforced at all.
     *
     * @default null
     */
    enforceAt: d.timestamp({ withTimezone: true, mode: "date" }),
    enforcedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    releasedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * Whether this case blocks the customer from placing new orders.
     *
     * Mirrored onto `users.ordering_blocked_at` in the same transaction, which
     * is what checkout actually reads.
     */
    blocksOrdering: d.boolean().notNull().default(false),
    /**
     * When the customer has to have answered by. Null until they are asked.
     *
     * @default null
     */
    respondBy: d.timestamp({ withTimezone: true, mode: "date" }),
    escalatedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * How long a mitigated case is watched before it is allowed to close.
     *
     * A customer who says they have fixed it is believed, and then checked: a
     * matching signal inside this window reopens the case at the level it was
     * enforced at, rather than starting the process over.
     *
     * @default null
     */
    observeUntil: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * When assisted triage last looked at this case.
     *
     * A column rather than a scan of the audit trail: the sweep asks "which
     * cases has nobody classified" on every run, and that has to be an index
     * rather than a join.
     *
     * @default null
     */
    classifiedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * Set when the address resolved to a customer who no longer holds it.
     *
     * Blocks automatic enforcement. Both parties are named on the case and an
     * operator decides.
     */
    staleAttribution: d.boolean().notNull().default(false),
    /**
     * `abuse+<number>.<hmac>@...`, minted when the case opens.
     *
     * The HMAC is not decoration: without it the address is guessable, and
     * anyone could post into another customer's case by emailing it.
     *
     * @default null
     */
    mailboxAddress: d.text().unique(),
    assignedTo: d.text().references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** The operator who opened it by hand. Null when a rule did. */
    openedBy: d.text().references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    resolution: abuseCaseResolutionEnum(),
    closedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    closedBy: d.text().references(() => users.id, {
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
    d.unique().on(t.number),
    d.index().on(t.userId),
    d.index().on(t.status),
    d.index().on(t.assignedTo),
    // The reconciliation cron sweeps by deadline across open cases only.
    d.index().on(t.status, t.respondBy),
    d.index().on(t.status, t.enforceAt),
    d.index().on(t.status, t.observeUntil),
    // The triage sweep reads unclassified cases only, and almost every row is
    // either classified or not in triage.
    d.index().on(t.status, t.classifiedAt),
  ],
);

/**
 * Which servers a case implicates, and what has actually been done to each.
 *
 * Many per case on purpose: one customer running five spamming VMs is one
 * conversation, not five.
 */
export const abuseCaseServers = d.snakeCase.table(
  "abuse_case_servers",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "absrv_" })),
    caseId: d
      .text()
      .notNull()
      .references(() => abuseCases.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    serverId: d
      .text()
      .notNull()
      .references(() => servers.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    lockLevel: abuseEnforcementLevelEnum().notNull().default("none"),
    lockedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    releasedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * When reconciliation last confirmed the lock was really in place on the
     * hypervisor.
     *
     * @default null
     */
    lastAssertedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The hypervisor settings this lock replaced.
     *
     * A release has to restore what was there, not a default: a customer who
     * had their firewall switched off before the lock must not find it
     * switched on afterwards, and a server that was stopped when the case
     * opened must not be started by the release.
     *
     * @default null
     */
    previousState: d.jsonb(),
    /**
     * How many times the lock had to be put back.
     *
     * A customer can edit their own firewall, so a lock that is only applied
     * once is not a lock. Drift is re-asserted and counted, and a count that
     * keeps climbing is evidence rather than a bug report.
     */
    driftCount: d.integer().notNull().default(0),
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
  (t) => [d.unique().on(t.caseId, t.serverId), d.index().on(t.serverId)],
);

/**
 * The thread. One table for what the customer writes, what an operator
 * writes, what the reporter emails in, and what the system records.
 *
 * `audience` is filtered in the tRPC output schema rather than in a component:
 * an internal note, and a reply to the reporter, must both be impossible to
 * leak to the customer by editing the UI.
 */
export const abuseCaseMessages = d.snakeCase.table(
  "abuse_case_messages",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "abmsg_" })),
    caseId: d
      .text()
      .notNull()
      .references(() => abuseCases.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    authorKind: abuseMessageAuthorEnum().notNull(),
    authorUserId: d.text().references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * [!] Untrusted. The reporter's address, for a message that arrived by
     * email. Never shown to the customer.
     *
     * @default null
     */
    authorEmail: d.text(),
    audience: abuseMessageAudienceEnum().notNull().default("customer"),
    /**
     * [!] Untrusted for anything but `operator` and `system`. Sanitised on the
     * way in and escaped again at every sink that interprets markup.
     */
    body: d.text().notNull(),
    bodyHtml: d.text(),
    /**
     * RFC 5322 `Message-ID`, for threading replies back onto the case when
     * plus-addressing has been stripped by the reporter's mail system.
     *
     * @default null
     */
    messageId: d.text(),
    inReplyTo: d.text(),
    emailId: d.text().references(() => emails.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    attachments: d.jsonb(),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [d.index().on(t.caseId, t.createdAt), d.index().on(t.messageId)],
);

/**
 * Who reported this, and whether they have been told we are on it.
 *
 * First-class rather than a column on the signal, because one case absorbs
 * several reports from several senders and each of them is owed an answer.
 */
export const abuseCaseContacts = d.snakeCase.table(
  "abuse_case_contacts",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "abcon_" })),
    caseId: d
      .text()
      .notNull()
      .references(() => abuseCases.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** [!] Untrusted. Never shown to the customer. */
    email: d.text().notNull(),
    /** [!] Untrusted. */
    name: d.text(),
    /** [!] Untrusted. */
    organization: d.text(),
    /**
     * A national CERT is not a random reporter, and the difference decides how
     * fast somebody has to answer.
     */
    kind: abuseContactKindEnum().notNull().default("reporter"),
    /**
     * When the automatic acknowledgement went out.
     *
     * The latch that makes it once per contact per case. Auto-replying to
     * inbound mail is how a mail loop starts, and this is the first of the
     * guards against one.
     *
     * @default null
     */
    acknowledgedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * Whether we may write to them at all.
     *
     * Some reporting systems explicitly ask not to be mailed back, and an
     * abuse desk that ignores that gets its address blocked.
     */
    notify: d.boolean().notNull().default(true),
    firstSeenAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    lastSeenAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [d.unique().on(t.caseId, t.email), d.index().on(t.email)],
);

/**
 * Append-only audit.
 *
 * Every status change, every enforcement applied or released, every detected
 * lock drift, every notification sent. If a suspension is ever contested,
 * this table is the answer, so nothing writes to it conditionally.
 */
export const abuseCaseEvents = d.snakeCase.table(
  "abuse_case_events",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "abevt_" })),
    caseId: d
      .text()
      .notNull()
      .references(() => abuseCases.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** Dotted, e.g. `status.changed`, `enforcement.applied`, `lock.drift`. */
    type: d.text().notNull(),
    actorKind: abuseEventActorEnum().notNull(),
    actorUserId: d.text().references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    fromValue: d.text(),
    toValue: d.text(),
    metadata: d.jsonb().notNull().default({}),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [d.index().on(t.caseId, t.createdAt)],
);

export type AbuseCase = typeof abuseCases.$inferSelect;
export type AbuseCaseServer = typeof abuseCaseServers.$inferSelect;
export type AbuseCaseMessage = typeof abuseCaseMessages.$inferSelect;
export type AbuseCaseContact = typeof abuseCaseContacts.$inferSelect;
export type AbuseCaseEvent = typeof abuseCaseEvents.$inferSelect;
export type AbuseCaseStatus = AbuseCase["status"];
export type AbuseEnforcementLevel = AbuseCaseServer["lockLevel"];
