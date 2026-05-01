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
import { check, index, pgTable } from "drizzle-orm/pg-core";
import { createId } from "../utils";
import { proxmoxIsoDownloads } from "./proxmox-iso-downloads";
import { servers } from "./servers";

export const serverMounts = pgTable(
  "server_mounts",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "mnt_" })),
    serverId: t
      .text()
      .notNull()
      .references(() => servers.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    isoDownloadId: t
      .text()
      .notNull()
      .references(() => proxmoxIsoDownloads.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    drive: t.text().notNull(),
  }),
  (t) => [
    index().on(t.serverId),
    index().on(t.isoDownloadId),
    check("valid_mount_drive", sql`${t.drive} ~ '^ide[0-3]$'`),
  ],
);

export type DatabaseServerMount = typeof serverMounts.$inferSelect;
