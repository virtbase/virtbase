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
import { pgTable } from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";
import { proxmoxNodes } from "./proxmox-nodes";
import { serverPlans } from "./server-plans";

/**
 * A Proxmox VE node group represents a logical grouping of Proxmox VE nodes
 * with similar specifications.
 */
export const proxmoxNodeGroups = pgTable("proxmox_node_groups", (t) => ({
  id: t
    .text()
    .primaryKey()
    .$default(() =>
      createId({
        prefix: "png_",
      }),
    ),
  /**
   * The internal name of the Proxmox VE node group.
   *
   * @example "Skylink EPYC 7443P"
   */
  name: t.text().notNull().unique(),

  createdAt: t
    .timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),

  updatedAt: t
    .timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => sql`now()`),
}));

export const proxmoxNodeGroupsRelations = relations(
  proxmoxNodeGroups,
  ({ many }) => ({
    proxmoxNodes: many(proxmoxNodes),
    serverPlans: many(serverPlans),
  }),
);
