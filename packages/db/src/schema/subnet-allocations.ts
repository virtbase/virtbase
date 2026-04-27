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
import { index, pgTable } from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";
import { servers } from "./servers";
import { subnets } from "./subnets";

export const subnetAllocations = pgTable(
  "subnet_allocations",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() =>
        createId({
          prefix: "ipalloc_",
        }),
      ),
    /**
     * The ID of the subnet associated with this subnet allocation.
     */
    subnetId: t
      .text()
      .notNull()
      .references(() => subnets.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The ID of the server associated with this subnet allocation.
     * An allocation can also be created without a server.
     */
    serverId: t.text().references(() => servers.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    /**
     * The description of the subnet allocation.
     * Mainly used for by the system created allocations.
     */
    description: t.text(),
    /**
     * The timestamp when the subnet was allocated.
     */
    allocatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    /**
     * The timestamp when the subnet was deallocated.
     */
    deallocatedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  }),
  (t) => [index().on(t.subnetId), index().on(t.serverId)],
);

export type DatabaseSubnetAllocations = typeof subnetAllocations.$inferSelect;
