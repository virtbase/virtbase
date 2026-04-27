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
import { proxmoxTemplateGroups } from "./proxmox-template-groups";

/**
 * A Proxmox VE template represents a template that can be used to create new guests.
 */
export const proxmoxTemplates = pgTable(
  "proxmox_templates",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "temp_" })),
    /**
     * The ID of the Proxmox VE template group this Proxmox VE template belongs to.
     */
    proxmoxTemplateGroupId: t
      .text()
      .notNull()
      .references(() => proxmoxTemplateGroups.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The name of the Proxmox VE template.
     *
     * @example "Debian 12 (Bookworm)"
     */
    name: t.text().notNull(),
    /**
     * The icon image url of the Proxmox VE template.
     * (must be allowed by CSP)
     */
    icon: t.text(),
    /**
     * The required number of cores for the Proxmox VE template.
     *
     * @default null
     */
    requiredCores: t.smallint(),
    /**
     * The recommended number of cores for the Proxmox VE template.
     *
     * @default null
     */
    recommendedCores: t.smallint(),
    /**
     * The required memory for the Proxmox VE template in MiB.
     *
     * @default null
     */
    requiredMemory: t.integer(),
    /**
     * The recommended memory for the Proxmox VE template in MiB.
     *
     * @default null
     */
    recommendedMemory: t.integer(),
    /**
     * The required storage for the Proxmox VE template in GiB.
     *
     * @default null
     */
    requiredStorage: t.integer(),
    /**
     * The recommended storage for the Proxmox VE template in GiB.
     *
     * @default null
     */
    recommendedStorage: t.integer(),
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
  (t) => [index().on(t.proxmoxTemplateGroupId)],
);

export type DatabaseProxmoxTemplates = typeof proxmoxTemplates.$inferSelect;
