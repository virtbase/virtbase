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
import { users } from "./auth";
import { proxmoxNodes } from "./proxmox-nodes";

export const proxmoxIsoDownloads = d.snakeCase.table(
  "proxmox_iso_downloads",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "iso_" })),
    proxmoxNodeId: d
      .text()
      .notNull()
      .references(() => proxmoxNodes.id, {
        // Don't allow deletion of the Proxmox VE node if it still has ISO downloads
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, {
        // Don't allow deletion of the user if it still has ISO downloads
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    /**
     * The user-defined name of the ISO image.
     */
    name: d.text().notNull(),
    /**
     * The Proxmox UPID of the ISO image download task.
     */
    upid: d.text().notNull(),
    /**
     * The URL that was used to download the ISO image.
     */
    url: d.text().notNull(),
    /**
     * The timestamp when the ISO image will expire.
     * After this timestamp, the ISO image can no longer be used and will be deleted soon.
     */
    expiresAt: d.timestamp({ withTimezone: true, mode: "date" }).notNull(),
    /**
     * The timestamp when the ISO image download was finished (any status).
     */
    finishedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the ISO image download failed, if it failed.
     */
    failedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the Proxmox VE ISO download was created.
     */
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    /**
     * The timestamp when the Proxmox VE ISO download was last updated.
     */
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [d.index().on(t.userId), d.index().on(t.proxmoxNodeId)],
);

export type DatabaseProxmoxIsoDownload =
  typeof proxmoxIsoDownloads.$inferSelect;
