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

/**
 * Application configuration, keyed by a dotted namespace such as
 * `billing.credit.enabled`. One row per setting rather than one row per
 * category, so a write touches only what changed.
 *
 * Values are validated against a Zod descriptor in `@virtbase/config` before
 * they land here; the column is deliberately untyped JSON because the schema
 * lives in code, where it can evolve with a migration-free deploy.
 *
 * Secrets never go in this table — see `integrationSecrets`.
 */
export const settings = d.snakeCase.table("settings", {
  key: d.text().primaryKey(),
  value: d.jsonb().notNull(),
  createdAt: d
    .timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: d
    .timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => sql`now()`),
});

export type Setting = typeof settings.$inferSelect;
