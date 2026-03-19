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
import { pgTable, primaryKey } from "drizzle-orm/pg-core";
import { proxmoxNodes } from "./proxmox-nodes";
import { proxmoxTemplates } from "./proxmox-templates";

export const proxmoxTemplatesToProxmoxNodes = pgTable(
  "proxmox_templates_to_proxmox_nodes",
  (t) => ({
    /**
     * The ID of the Proxmox VE template this Proxmox VE template to Proxmox VE node association belongs to.
     */
    proxmoxTemplateId: t
      .text()
      .notNull()
      .references(() => proxmoxTemplates.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The ID of the Proxmox VE node this Proxmox VE template to Proxmox VE node association belongs to.
     */
    proxmoxNodeId: t
      .text()
      .notNull()
      .references(() => proxmoxNodes.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The VM ID of the Proxmox VE template on the Proxmox VE node.
     *
     * @example 100
     */
    vmid: t.integer().notNull(),
    /**
     * The storage this Proxmox VE template is available on
     * at this specific Proxmox VE node.
     *
     * @example "local-lvm", "cephfs", "nfs"
     */
    storage: t.text().notNull(),
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
    // Combined primary key => implicit index on both columns
    primaryKey({
      // Custom name otherwise it would be too long / truncated
      name: "pt2pn_composite_pk",
      columns: [t.proxmoxTemplateId, t.proxmoxNodeId],
    }),
  ],
);

export const proxmoxTemplatesToProxmoxNodesRelations = relations(
  proxmoxTemplatesToProxmoxNodes,
  ({ one }) => ({
    proxmoxTemplate: one(proxmoxTemplates, {
      fields: [proxmoxTemplatesToProxmoxNodes.proxmoxTemplateId],
      references: [proxmoxTemplates.id],
    }),
    proxmoxNode: one(proxmoxNodes, {
      fields: [proxmoxTemplatesToProxmoxNodes.proxmoxNodeId],
      references: [proxmoxNodes.id],
    }),
  }),
);
