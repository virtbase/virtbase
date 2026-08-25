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
import { cloudInitSnippets } from "./cloud-init-snippets";
import { proxmoxTemplates } from "./proxmox-templates";

/**
 * Per-template override of a snippet's selector.
 *
 * A snippet's `targets` decide the default; this table is the exception. A row
 * with `attached = true` applies a snippet the selector would have skipped, and
 * `attached = false` withdraws one it would have matched - so an awkward
 * template never forces a selector to be contorted around it.
 */
export const templateSnippets = d.snakeCase.table(
  "template_snippets",
  {
    proxmoxTemplateId: d
      .text()
      .notNull()
      .references(() => proxmoxTemplates.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    cloudInitSnippetId: d
      .text()
      .notNull()
      .references(() => cloudInitSnippets.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * `true` forces the snippet on, `false` forces it off. There is no third
     * state - absence of a row means "whatever the selector says".
     *
     * @default true
     */
    attached: d.boolean().notNull().default(true),
    /**
     * Overrides the snippet's own `priority` for this template only. Null keeps
     * the snippet's ordering.
     */
    priority: d.smallint(),
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
    d.primaryKey({
      // Custom name, otherwise it would be truncated
      name: "ts_composite_pk",
      columns: [t.proxmoxTemplateId, t.cloudInitSnippetId],
    }),
    d.index().on(t.cloudInitSnippetId),
  ],
);

export type DatabaseTemplateSnippet = typeof templateSnippets.$inferSelect;
