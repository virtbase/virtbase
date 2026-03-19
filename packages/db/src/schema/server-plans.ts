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
import { createId } from "../utils/create-id";
import { proxmoxNodeGroups } from "./proxmox-node-groups";

export const serverPlans = pgTable(
  "server_plans",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "pck_" })),
    proxmoxNodeGroupId: t
      .text()
      .references(() => proxmoxNodeGroups.id, {
        // Don't allow deletion of the Proxmox VE node group if it still has server plans
        onDelete: "restrict",
        onUpdate: "cascade",
      })
      .notNull(),
    name: t.text().notNull(),
    /**
     * The number of guaranteed vCores of the server plan.
     *
     * @example 1
     */
    cores: t.smallint().notNull(),
    /**
     * The guaranteed memory of the server plan in MiB.
     *
     * @example 1024 MiB = 1 GiB
     */
    memory: t.integer().notNull(),
    /**
     * The guaranteed storage of the server plan in GiB.
     *
     * @example 100 GiB
     */
    storage: t.integer().notNull(),
    /**
     * The maximum network bandwidth limit of the server plan in MB/s
     *
     * If not set, the network bandwidth is not limited.
     *
     * @default null
     */
    netrate: t.smallint(),
    /**
     * The monthly price of the server plan in cents.
     *
     * @example 1000 cents = 10 €
     */
    price: t.integer().notNull(),
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
  (t) => [index().on(t.proxmoxNodeGroupId)],
);

export const serverPlansRelations = relations(serverPlans, ({ one }) => ({
  proxmoxNodeGroup: one(proxmoxNodeGroups, {
    fields: [serverPlans.proxmoxNodeGroupId],
    references: [proxmoxNodeGroups.id],
  }),
}));
