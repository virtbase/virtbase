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
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { index, pgTable } from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";

/**
 * A subnet represents a contiguous block of IP addresses.
 */
export const subnets = pgTable(
  "subnets",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() =>
        createId({
          prefix: "ipsub_",
        }),
      ),
    /**
     * If the subnet is a child subnet, the ID of the parent.
     */
    parentId: t
      .varchar({ length: 255 })
      .references((): AnyPgColumn => subnets.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The network specification of the subnet in CIDR notation.
     * @example "192.168.1.0/24"
     */
    cidr: t.cidr().notNull().unique(),
    /**
     * The gateway IP address of the subnet.
     * @example "192.168.1.1"
     */
    gateway: t.inet().notNull(),
    /**
     * The VLAN ID of the subnet.
     * @example 100
     * @default 0
     */
    vlan: t.integer().notNull().default(0),
    /**
     * The DNS reverse zone of the subnet.
     * @example "10.10.10.in-addr.arpa"
     */
    dnsReverseZone: t.varchar({ length: 255 }),
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
  (t) => [index().on(t.parentId)],
);

export type DatabaseSubnets = typeof subnets.$inferSelect;
