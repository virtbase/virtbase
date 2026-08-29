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
  abuseCaseSeverityEnum,
  abuseCategoryEnum,
  abuseEnforcementLevelEnum,
  signalSeverityEnum,
} from "./abuse-enums";

/**
 * What to do about a signal.
 *
 * Typed columns rather than one jsonb blob: the admin console generates a real
 * form from them, Postgres can index the ones the matcher reads on every
 * signal, and a malformed rule is a constraint violation rather than a
 * surprise at three in the morning.
 *
 * First match by `priority` wins, and the matched rule id is written onto the
 * signal - a suspension has to be explainable by pointing at the rule that
 * caused it.
 */
export const abuseRules = d.snakeCase.table(
  "abuse_rules",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "abrul_" })),
    enabled: d.boolean().notNull().default(true),
    /** Lower runs first. */
    priority: d.integer().notNull().default(100),
    name: d.text().notNull(),
    description: d.text(),

    /** Signal type glob, e.g. `abuse.*` or `abuse.ddos`. */
    matchType: d.text().notNull(),
    /** Restricts the rule to one source. Null matches any. */
    matchSource: d.text(),
    matchSeverityMin: signalSeverityEnum(),
    matchConfidenceMin: d.integer(),
    /** Label subset that must be present with these exact values. */
    matchLabels: d.jsonb().notNull().default({}),
    /** Only fires once the customer has this many resolved cases behind them. */
    matchRepeatCountMin: d.integer(),

    /**
     * Whether a signal matching this rule may enforce without a human.
     *
     * Off by default, and the single most important column in the table. A
     * competitor filing plausible reports must not be able to suspend a
     * customer, so enforcement is opted into per source rather than assumed.
     */
    trustedSource: d.boolean().notNull().default(false),

    actionOpenCase: d.boolean().notNull().default(true),
    actionCategory: abuseCategoryEnum(),
    actionCaseSeverity: abuseCaseSeverityEnum(),
    actionEnforcement: abuseEnforcementLevelEnum().notNull().default("none"),
    /** Delay before enforcement, so the customer can act on the notice first. */
    actionGraceMinutes: d.integer().notNull().default(0),
    actionBlockOrders: d.boolean().notNull().default(false),
    actionNotifyUser: d.boolean().notNull().default(true),
    actionResponseHours: d.integer().notNull().default(24),
    /** Closes a quiet case by itself after this long. Null never does. */
    actionAutoCloseHours: d.integer(),

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
  (t) => [d.index().on(t.enabled, t.priority)],
);

/**
 * How far each pull source has read, per range.
 *
 * Per target rather than per source, because a run cut short by the daily
 * quota has covered some ranges and not others. Advancing a single watermark
 * would silently skip whatever the budget did not reach.
 */
export const abuseSourceCursors = d.snakeCase.table(
  "abuse_source_cursors",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "abcur_" })),
    source: d.text().notNull(),
    /** The polled range, in CIDR notation. */
    target: d.text().notNull(),
    watermark: d.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    lastPolledAt: d.timestamp({ withTimezone: true, mode: "date" }),
    lastError: d.text(),
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
  (t) => [d.unique().on(t.source, t.target), d.index().on(t.lastPolledAt)],
);

export type AbuseRule = typeof abuseRules.$inferSelect;
export type AbuseSourceCursor = typeof abuseSourceCursors.$inferSelect;
