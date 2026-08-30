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
import * as d from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";

/**
 * A subnet represents a contiguous block of IP addresses.
 */
export const subnets = d.snakeCase.table(
  "subnets",
  {
    id: d
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
    parentId: d
      .varchar({ length: 255 })
      .references((): AnyPgColumn => subnets.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The network specification of the subnet in CIDR notation.
     * @example "192.168.1.0/24"
     */
    cidr: d.cidr().notNull().unique(),
    /**
     * The gateway IP address of the subnet.
     * @example "192.168.1.1"
     */
    gateway: d.inet().notNull(),
    /**
     * The VLAN ID of the subnet.
     * @example 100
     * @default 0
     */
    vlan: d.integer().notNull().default(0),
    /**
     * The DNS reverse zone of the subnet.
     * @example "10.10.10.in-addr.arpa"
     */
    dnsReverseZone: d.varchar({ length: 255 }),
    /**
     * Until when this subnet is held for a provisioning run that has not yet
     * written its allocation row.
     *
     * Selecting a free subnet and claiming it has to be atomic, but the real
     * `subnet_allocations` row cannot be written until the server exists —
     * minutes later, after the clone, the disk resize and cloud-init. Without
     * a claim in between, two concurrent provisions were reliably handed the
     * same address.
     *
     * A timestamp rather than a boolean so an abandoned run cannot leak the
     * address forever: the reservation simply expires and the subnet returns
     * to the pool on its own, with no reaper to schedule or forget.
     *
     * @default null
     */
    reservedUntil: d.timestamp({ withTimezone: true, mode: "date" }),
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
    d.index().on(t.parentId),
    // Abuse attribution asks `cidr >>= $address` twice per signal, over a
    // table that gains a row per address ever carved and never loses one. A
    // btree - which is all the unique constraint on `cidr` gives - cannot
    // answer containment, so that was a sequential scan of the whole table.
    d.index("subnets_cidr_gist_index").using("gist", t.cidr.op("inet_ops")),
  ],
);

export type DatabaseSubnets = typeof subnets.$inferSelect;
