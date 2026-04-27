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
import { users } from "./auth";
import { proxmoxNodes } from "./proxmox-nodes";
import { proxmoxTemplates } from "./proxmox-templates";
import { serverPlans } from "./server-plans";

export const servers = pgTable(
  "servers",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "kvm_" })),
    userId: t
      .text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    serverPlanId: t
      .text()
      .notNull()
      .references(() => serverPlans.id, {
        // Don't allow deletion of the server plan if it still has servers
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    proxmoxNodeId: t
      .text()
      .notNull()
      .references(() => proxmoxNodes.id, {
        // Don't allow deletion of the Proxmox VE node if it still has servers
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    proxmoxTemplateId: t.text().references(() => proxmoxTemplates.id, {
      // Don't allow deletion of the Proxmox VE template if it still has servers
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    /**
     * The user-defined display name of the server.
     *
     * @example "My server"
     */
    name: t.text().notNull(),
    /**
     * The Proxmox VM ID.
     *
     * @example 100
     */
    vmid: t.integer().notNull(),
    /**
     * The timestamp when the server was installed.
     * If the server is not installed, this is null.
     *
     * @default null
     */
    installedAt: t.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the server will be terminated, if termination is requested or service is not renewed.
     *
     * @default null
     */
    terminatesAt: t.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the last renewal reminder was sent.
     * Used to avoid sending duplicate reminders for the same expiration period.
     *
     * @default null
     */
    renewalReminderSentAt: t.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the server was suspended. Notice sent out to the customer.
     * After a certain amount of time, the server will be deleted automatically.
     *
     * @default null
     */
    suspendedAt: t.timestamp({ withTimezone: true, mode: "date" }),
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
  (t) => [
    index().on(t.userId),
    index().on(t.serverPlanId),
    index().on(t.proxmoxNodeId),
    index().on(t.proxmoxTemplateId),
  ],
);

export type DatabaseServer = typeof servers.$inferSelect;
