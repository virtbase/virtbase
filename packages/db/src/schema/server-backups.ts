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
import { proxmoxTemplates } from "./proxmox-templates";
import { servers } from "./servers";

export const serverBackups = pgTable(
  "server_backups",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "kbu_" })),
    serverId: t
      .text()
      .notNull()
      .references(() => servers.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    proxmoxTemplateId: t.text().references(() => proxmoxTemplates.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * The user-defined name of the backup.
     *
     * @example "My backup"
     */
    name: t.varchar().notNull(),
    /**
     * If locked, the backup is protected and cannot be deleted.
     */
    isLocked: t.boolean().notNull().default(false),
    /**
     * The Proxmox volume ID, in the format <storage>:<content_type>/vzdump-<vm_type>-<vm_id>-<date_string>.<format>
     */
    volid: t.varchar(),
    /**
     * The size of the backup in bytes.
     */
    size: t.bigint({
      mode: "number",
    }),
    /**
     * The Proxmox UPID of the backup task.
     */
    upid: t.varchar().notNull(),
    /**
     * The timestamp when the backup task was started.
     * (= createdAt timestamp of the backup)
     */
    startedAt: t
      .timestamp({
        withTimezone: true,
        mode: "date",
      })
      .notNull()
      .defaultNow(),
    /**
     * If failed, the timestamp when the backup failed.
     */
    failedAt: t.timestamp({
      withTimezone: true,
      mode: "date",
    }),
    /**
     * The timestamp when the backup was finished (any status).
     */
    finishedAt: t.timestamp({
      withTimezone: true,
      mode: "date",
    }),
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  }),
  (t) => [
    index().on(t.serverId),
    index().on(t.proxmoxTemplateId),
    index().on(t.upid),
    index().on(t.volid),
  ],
);

export const serverBackupsRelations = relations(serverBackups, ({ one }) => ({
  server: one(servers, {
    fields: [serverBackups.serverId],
    references: [servers.id],
  }),
  proxmoxTemplate: one(proxmoxTemplates, {
    fields: [serverBackups.proxmoxTemplateId],
    references: [proxmoxTemplates.id],
  }),
}));
