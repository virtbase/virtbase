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
import { pgTable } from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";

/**
 * A Proxmox VE template group represents a logical grouping of Proxmox VE templates
 * with similar specifications.
 */
export const proxmoxTemplateGroups = pgTable(
  "proxmox_template_groups",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() =>
        createId({
          prefix: "ptg_",
        }),
      ),
    /**
     * The name of the Proxmox VE template group.
     *
     * @example "Debian"
     */
    name: t.text().notNull().unique(),
    /**
     * The priority of the Proxmox VE template group.
     * Lower numbers are displayed first.
     * Items of same priority are displayed in alphabetical order.
     *
     * @type integer
     * @default 0
     * @example 0
     */
    priority: t.smallint().notNull().default(0),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),

    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  }),
);

export type DatabaseProxmoxTemplateGroups =
  typeof proxmoxTemplateGroups.$inferSelect;
