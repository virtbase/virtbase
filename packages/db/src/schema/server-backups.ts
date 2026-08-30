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
     * The guest's `os-release` `ID` at the moment the backup was taken.
     *
     * Snapshotted rather than read from the server, because a backup restores
     * the disk as it was: a customer who took a backup of Debian and has since
     * installed Arch would otherwise be told the archive contains Arch, and
     * find out otherwise only after restoring it.
     *
     * Null for a backup taken before detection existed, or of a server whose
     * agent never answered - the template is the fallback, as everywhere else.
     *
     * @example "debian"
     * @default null
     */
    detectedOsId: d.text(),
    /**
     * The guest's `os-release` `PRETTY_NAME` at the moment the backup was
     * taken.
     *
     * [!] Guest-controlled, and already sanitised when it was stored on the
     * server row - see `servers.detectedOsName`.
     *
     * @example "Debian GNU/Linux 13 (trixie)"
     * @default null
     */
    detectedOsName: d.text(),
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
    // The ten-minute reconciler sweeps exactly this predicate, oldest first,
    // over a table that only ever grows. Partial, because a settled backup is
    // never a candidate and almost every row is settled.
    d.index().on(t.startedAt).where(sql`${t.finishedAt} IS NULL`),
  ],
);

export type DatabaseServerBackups = typeof serverBackups.$inferSelect;
