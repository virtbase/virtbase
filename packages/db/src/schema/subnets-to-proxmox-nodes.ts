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
import { proxmoxNodes } from "./proxmox-nodes";
import { subnets } from "./subnets";

/**
 * A subnet to Proxmox VE node association represents a relationship
 * between a subnet and a Proxmox VE node.
 */
export const subnetsToProxmoxNodes = d.snakeCase.table(
  "subnets_to_proxmox_nodes",
  {
    subnetId: d
      .text()
      .notNull()
      .references(() => subnets.id, {
        // Don't allow deletion of the subnet if it still has Proxmox VE nodes associated with it
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    proxmoxNodeId: d
      .text()
      .notNull()
      .references(() => proxmoxNodes.id, {
        // Don't allow deletion of the Proxmox VE node if it still has subnets associated with it
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    /**
     * The bridge interface name of the IPAM subnet on the Proxmox VE node.
     * @example "vmbr0" (no VLAN ID), "vmbr0.1211" (with VLAN ID)
     */
    bridge: d.text().notNull(),
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
    // Combined primary key => implicit index on both columns
    d.primaryKey({ columns: [t.subnetId, t.proxmoxNodeId] }),
  ],
);

export type DatabaseSubnetsToProxmoxNodes =
  typeof subnetsToProxmoxNodes.$inferSelect;
