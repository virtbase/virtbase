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

import * as Sentry from "@sentry/node";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxIsoDownloads, proxmoxNodes } from "@virtbase/db/schema";
import { getProxmoxInstance } from "../../proxmox";

type PurgeIsoDownloadsStepParams = {
  userId: string;
};

/**
 * Deletes the customer's uploaded ISO images from node storage, then the rows.
 *
 * [!] Must run before anything writes to `users`. Unlike every other table
 * hanging off an account, `proxmox_iso_downloads.user_id` is `onDelete:
 * "restrict"` - so a customer who ever uploaded a custom image cannot be
 * removed at all while these rows exist. That single constraint is why
 * Better Auth's own `deleteUser` would throw for a subset of accounts.
 *
 * The stored `url` is customer-supplied and may carry credentials, so these
 * rows are erased outright rather than kept for the record.
 */
export async function purgeIsoDownloadsStep({
  userId,
}: PurgeIsoDownloadsStepParams) {
  "use step";

  const downloads = await db
    .select({
      id: proxmoxIsoDownloads.id,
      upid: proxmoxIsoDownloads.upid,
      failedAt: proxmoxIsoDownloads.failedAt,
      proxmoxNode: {
        hostname: proxmoxNodes.hostname,
        fqdn: proxmoxNodes.fqdn,
        // [!] Sensitive data
        tokenID: proxmoxNodes.tokenID,
        tokenSecret: proxmoxNodes.tokenSecret,
        isoDownloadStorage: proxmoxNodes.isoDownloadStorage,
      },
    })
    .from(proxmoxIsoDownloads)
    .innerJoin(
      proxmoxNodes,
      eq(proxmoxIsoDownloads.proxmoxNodeId, proxmoxNodes.id),
    )
    .where(eq(proxmoxIsoDownloads.userId, userId));

  for (const download of downloads) {
    // A download that failed wrote no file, so there is nothing on the storage
    // to remove - only the task entry and the row.
    if (!download.failedAt) {
      const instance = getProxmoxInstance(download.proxmoxNode);
      const storage = download.proxmoxNode.isoDownloadStorage;

      try {
        await instance.node.tasks.$(download.upid).$delete();
      } catch (error) {
        Sentry.captureException(error);
      }

      try {
        await instance.node.storage
          .$(storage)
          .content.$(`${storage}:iso/${download.id}.iso`)
          .$delete();
      } catch (error) {
        // Reported and swallowed: a node that cannot be reached must not stop
        // an erasure the customer has a right to. The row still goes.
        Sentry.captureException(error);
      }
    }

    await db
      .delete(proxmoxIsoDownloads)
      .where(eq(proxmoxIsoDownloads.id, download.id));
  }

  return { purged: downloads.length };
}
