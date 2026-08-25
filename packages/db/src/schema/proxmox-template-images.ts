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
import { proxmoxNodes } from "./proxmox-nodes";
import { proxmoxTemplates } from "./proxmox-templates";

/**
 * Tracks whether a template's image is present and fresh on one node's import
 * storage. This is a cache record, not a definition - deleting a row only means
 * the image is downloaded again.
 *
 * A row starts unsettled: `upid` names the running `download-url` task and both
 * `downloadedAt` and `failedAt` are null. Exactly one place moves it to a
 * terminal state, and it runs from a cron as well as from the provisioning
 * workflow - a download that is only ever reconciled by a browser is a download
 * that strands the moment the tab closes.
 *
 * A shared storage (CephFS, NFS) produces one row per node that can see it.
 * That is deliberate: Proxmox's storage and task APIs are node-scoped, so
 * reconciliation needs a node to ask.
 */
export const proxmoxTemplateImages = d.snakeCase.table(
  "proxmox_template_images",
  {
    proxmoxTemplateId: d
      .text()
      .notNull()
      .references(() => proxmoxTemplates.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    proxmoxNodeId: d
      .text()
      .notNull()
      .references(() => proxmoxNodes.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The import storage the image was downloaded to. Part of the key so a node
     * whose import storage is repointed does not silently reuse the old row.
     *
     * @example "cephfs", "local"
     */
    storage: d.text().notNull(),
    /**
     * The Proxmox volume identifier, fed straight to `import-from`.
     *
     * Content-addressed, so a refreshed image lands under a new name and the
     * previous volume is only removed once this row settles - no guest is ever
     * importing from a file being replaced underneath it.
     *
     * @example "cephfs:import/temp_01J…-ae204682c015.qcow2"
     */
    volid: d.text().notNull(),
    /**
     * The UPID of the `download-url` task while it is still running.
     * Null once the row has settled.
     */
    upid: d.text(),
    /**
     * The checksum that was actually verified, so a template whose source
     * checksum has since changed is detectable without re-downloading.
     */
    checksum: d.text(),
    /**
     * Size of the downloaded image in bytes, as reported by the storage
     * content listing.
     */
    sizeBytes: d.bigint({ mode: "number" }),
    /**
     * When the download finished successfully. Null while unsettled or failed.
     * Freshness is measured from here.
     */
    downloadedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * When the download settled in a non-`OK` state. Null while unsettled or
     * successful.
     */
    failedAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * Proxmox's own exit status for a failed download, surfaced in admin so a
     * broken URL or a checksum mismatch is legible without reading task logs.
     *
     * @example "download failed: exit code 8"
     */
    lastError: d.text(),
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
    d.primaryKey({
      // Custom name, otherwise it would be truncated
      name: "pti_composite_pk",
      columns: [t.proxmoxTemplateId, t.proxmoxNodeId, t.storage],
    }),
    // The cron sweeps unsettled rows across every template and node.
    d.index().on(t.upid),
    d.index().on(t.proxmoxNodeId),
  ],
);

export type DatabaseProxmoxTemplateImage =
  typeof proxmoxTemplateImages.$inferSelect;
