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
import { createId } from "../utils/create-id";

export const proxmoxNodeGroupStrategyEnum = d.pgEnum(
  "proxmox_node_group_strategy",
  ["RANDOM", "ROUND_ROBIN", "LEAST_USED", "FILL"],
);

/**
 * A Proxmox VE node group represents a logical grouping of Proxmox VE nodes
 * with similar specifications.
 */
export const proxmoxNodeGroups = d.snakeCase.table("proxmox_node_groups", {
  id: d
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
  name: d.text().notNull().unique(),
  /**
   * The strategy to use when selecting a node from the group.
   *
   * `RANDOM`: Select a node randomly.
   * `ROUND_ROBIN`: Select a node in a round-robin manner.
   * `LEAST_USED`: Select the node with the least usage.
   * `FILL`: Opposite of `LEAST_USED`. Select the node with the most usage and fill it until it is full.
   */
  strategy: proxmoxNodeGroupStrategyEnum().notNull().default("ROUND_ROBIN"),
  createdAt: d
    .timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: d
    .timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => sql`now()`),
});

export type DatabaseProxmoxNodeGroups = typeof proxmoxNodeGroups.$inferSelect;
