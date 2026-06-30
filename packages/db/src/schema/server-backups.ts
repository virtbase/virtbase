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
import { proxmoxTemplates } from "./proxmox-templates";
import { servers } from "./servers";

export const serverBackups = d.snakeCase.table(
  "server_backups",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "kbu_" })),
    serverId: d
      .text()
      .notNull()
      .references(() => servers.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    proxmoxTemplateId: d.text().references(() => proxmoxTemplates.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * The user-defined name of the backup.
     *
     * @example "My backup"
     */
    name: d.varchar().notNull(),
    /**
     * If locked, the backup is protected and cannot be deleted.
     */
    isLocked: d.boolean().notNull().default(false),
    /**
     * The Proxmox volume ID, in the format <storage>:<content_type>/vzdump-<vm_type>-<vm_id>-<date_string>.<format>
     */
    volid: d.varchar(),
    /**
     * The size of the backup in bytes.
     */
    size: d.bigint({
      mode: "number",
    }),
    /**
     * The Proxmox UPID of the backup task.
     */
    upid: d.varchar().notNull(),
    /**
     * The timestamp when the backup task was started.
     * (= createdAt timestamp of the backup)
     */
    startedAt: d
      .timestamp({
        withTimezone: true,
        mode: "date",
      })
      .notNull()
      .defaultNow(),
    /**
     * If failed, the timestamp when the backup failed.
     */
    failedAt: d.timestamp({
      withTimezone: true,
      mode: "date",
    }),
    /**
     * The timestamp when the backup was finished (any status).
     */
    finishedAt: d.timestamp({
      withTimezone: true,
      mode: "date",
    }),
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [
    d.index().on(t.serverId),
    d.index().on(t.proxmoxTemplateId),
    d.index().on(t.upid),
    d.index().on(t.volid),
  ],
);

export type DatabaseServerBackups = typeof serverBackups.$inferSelect;
