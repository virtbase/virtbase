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
import { subnetAllocations } from "./subnet-allocations";

export const pointerRecords = pgTable(
  "pointer_records",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "ipptr_" })),
    /**
     * The ID of the subnet allocation associated with this PTR record.
     * This could be a single /32 IPv4 child subnet allocation or an entire /64 IPv6 allocation.
     */
    subnetAllocationId: t
      .text()
      .notNull()
      .references(() => subnetAllocations.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The corresponding IP address of the PTR record.
     * @example "192.168.1.1"
     * @example "2001:db8::1"
     */
    ip: t.inet().notNull().unique(),
    /**
     * The hostname of the PTR record.
     * @example "vm01.example.com"
     * @example "192.168.1.1.customer.virtbase.com"
     */
    hostname: t.text().notNull(),
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
  (t) => [index().on(t.subnetAllocationId), index().on(t.ip)],
);

export type DatabasePointerRecords = typeof pointerRecords.$inferSelect;
