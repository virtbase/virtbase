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

import { relations, sql } from "drizzle-orm";
import { index, pgTable } from "drizzle-orm/pg-core";
import { createId } from "../utils";
import { proxmoxNodes } from "./proxmox-nodes";

/**
 * A datacenter represents a physical location where one ore more
 * Proxmox VE nodes are located.
 */
export const datacenters = pgTable(
  "datacenters",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() =>
        createId({
          prefix: "dc_",
        }),
      ),
    /**
     * The official name of the datacenter.
     *
     * @example "Skylink Data Center"
     */
    name: t.text().notNull().unique(),
    /**
     * The two-letter ISO 3166-1 alpha-2 code of the country.
     *
     * @example "NL"
     */
    country: t.text().notNull(),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .$onUpdate(() => sql`now()`)
      .notNull(),
  }),
  (t) => [index().on(t.name)],
);

export const datacentersRelations = relations(datacenters, ({ many }) => ({
  proxmoxNodes: many(proxmoxNodes),
}));
