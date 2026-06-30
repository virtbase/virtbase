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
import { proxmoxNodeGroups } from "./proxmox-node-groups";

export const serverPlans = d.snakeCase.table(
  "server_plans",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "pck_" })),
    proxmoxNodeGroupId: d
      .text()
      .references(() => proxmoxNodeGroups.id, {
        // Don't allow deletion of the Proxmox VE node group if it still has server plans
        onDelete: "restrict",
        onUpdate: "cascade",
      })
      .notNull(),
    name: d.text().notNull(),
    /**
     * The number of guaranteed vCores of the server plan.
     *
     * @example 1
     */
    cores: d.smallint().notNull(),
    /**
     * The guaranteed memory of the server plan in MiB.
     *
     * @example 1024 MiB = 1 GiB
     */
    memory: d.integer().notNull(),
    /**
     * The guaranteed storage of the server plan in GiB.
     *
     * @example 100 GiB
     */
    storage: d.integer().notNull(),
    /**
     * The maximum network bandwidth limit of the server plan in MB/s
     *
     * If not set, the network bandwidth is not limited.
     *
     * @default null
     */
    netrate: d.smallint(),
    /**
     * The monthly price of the server plan in cents.
     *
     * @example 1000 cents = 10 €
     */
    price: d.integer().notNull(),
    /**
     * Whether the server plan is highlighted as popular.
     *
     * @default false
     */
    recommended: d.boolean().notNull().default(false),
    /**
     * Another plan that will be shown as an upsell for this plan.
     *
     * @default null
     */
    upsellTo: d.text().references((): AnyPgColumn => serverPlans.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
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
    d.index().on(t.proxmoxNodeGroupId),
    // only one recommended plan per proxmox node group
    d
      .uniqueIndex("server_plans_proxmox_node_group_id_recommended_index")
      .on(t.proxmoxNodeGroupId)
      .where(sql`${t.recommended} IS TRUE`),
    d.check(
      "upsell_to_is_not_self",
      sql`${t.upsellTo} IS DISTINCT FROM ${t.id}`,
    ),
  ],
);

export type DatabaseServerPlan = typeof serverPlans.$inferSelect;
