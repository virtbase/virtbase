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
import { createId } from "../utils";

/**
 * A datacenter represents a physical location where one ore more
 * Proxmox VE nodes are located.
 */
export const datacenters = d.snakeCase.table(
  "datacenters",
  {
    id: d
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
    name: d.text().notNull().unique(),
    /**
     * The two-letter ISO 3166-1 alpha-2 code of the country.
     *
     * @example "NL"
     */
    country: d.text().notNull(),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .$onUpdate(() => sql`now()`)
      .notNull(),
  },
  (t) => [d.index().on(t.name)],
);

export type DatabaseDatacenter = typeof datacenters.$inferSelect;
