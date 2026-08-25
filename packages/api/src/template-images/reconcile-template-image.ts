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
import { and, eq, isNull } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import { proxmoxTemplateImages } from "@virtbase/db/schema";
import { TEMPLATE_IMAGE_STALE_AFTER_HOURS } from "@virtbase/utils";
import type { ProxmoxInstance } from "../proxmox";

type Database = typeof database;

/**
 * The key of one template-image row, which is also its composite primary key.
 */
export interface TemplateImageKey {
  proxmoxTemplateId: string;
  proxmoxNodeId: string;
  storage: string;
}

/**
 * A template-image row that has not reached a terminal state yet.
 */
export interface UnsettledTemplateImage extends TemplateImageKey {
  volid: string;
  upid: string | null;
  createdAt: Date;
  downloadedAt: Date | null;
  failedAt: Date | null;
}

export interface TemplateImageReconciliation {
  volid: string;
  downloadedAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  sizeBytes: number | null;
}

export interface ReconcileTemplateImageParams {
  db: Database;
  instance: ProxmoxInstance;
  image: UnsettledTemplateImage;
}

/**
 * Marks a Proxmox call that failed. Every Proxmox failure is treated the same
 * way here, so the reason only has to reach Sentry.
 */
const FAILED = Symbol("proxmox-call-failed");

const attempt = async <T>(
  operation: () => Promise<T>,
): Promise<T | typeof FAILED> => {
  try {
    return await operation();
  } catch (error) {
    Sentry.captureException(error);

    return FAILED;
  }
};

const hoursSince = (date: Date) => (Date.now() - date.getTime()) / 3_600_000;

const unchanged = (
  image: UnsettledTemplateImage,
): TemplateImageReconciliation => ({
  volid: image.volid,
  downloadedAt: image.downloadedAt,
  failedAt: image.failedAt,
  lastError: null,
  sizeBytes: null,
});

const settle = async (
  db: Database,
  image: UnsettledTemplateImage,
  values: Partial<typeof proxmoxTemplateImages.$inferInsert>,
): Promise<TemplateImageReconciliation> => {
  const where = and(
    eq(proxmoxTemplateImages.proxmoxTemplateId, image.proxmoxTemplateId),
    eq(proxmoxTemplateImages.proxmoxNodeId, image.proxmoxNodeId),
    eq(proxmoxTemplateImages.storage, image.storage),
  );

  const row = await db.transaction(
    async (tx) => {
      await tx
        .update(proxmoxTemplateImages)
        .set({ ...values, upid: null })
        // [!] The first terminal state wins - never overwrite a row that a
        // concurrent reconciliation already settled.
        .where(
          and(
            where,
            isNull(proxmoxTemplateImages.downloadedAt),
            isNull(proxmoxTemplateImages.failedAt),
          ),
        );

      return tx
        .select({
          volid: proxmoxTemplateImages.volid,
          downloadedAt: proxmoxTemplateImages.downloadedAt,
          failedAt: proxmoxTemplateImages.failedAt,
          lastError: proxmoxTemplateImages.lastError,
          sizeBytes: proxmoxTemplateImages.sizeBytes,
        })
        .from(proxmoxTemplateImages)
        .where(where)
        .limit(1)
        .then(([row]) => row);
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  // The row is gone - the template or node was deleted while we reconciled.
  return row ?? unchanged(image);
};

const markFailed = (
  db: Database,
  image: UnsettledTemplateImage,
  lastError: string,
) => settle(db, image, { failedAt: new Date(), lastError });

/**
 * Brings one template-image row in sync with its Proxmox `download-url` task,
 * and on success with the volume actually present on the import storage.
 *
 * Total, in the same sense as backup reconciliation: every branch either
 * settles the row or leaves it for a later run, and a row that can no longer be
 * resolved at all is failed once it is older than
 * `TEMPLATE_IMAGE_STALE_AFTER_HOURS`. An unsettled row makes its template
 * unavailable, so leaving one behind forever is worse than declaring it failed.
 *
 * Proxmox failures are reported to Sentry and swallowed: a node that is briefly
 * unreachable must never fail the caller.
 */
export async function reconcileTemplateImage({
  db,
  instance,
  image,
}: ReconcileTemplateImageParams): Promise<TemplateImageReconciliation> {
  if (image.downloadedAt || image.failedAt) {
    // Already settled
    return unchanged(image);
  }

  const isStale =
    hoursSince(image.createdAt) >= TEMPLATE_IMAGE_STALE_AFTER_HOURS;

  if (!image.upid) {
    // Unsettled with no task to ask about: the row was written but the
    // download never started, or the UPID was lost. Nothing can resolve it.
    return isStale
      ? markFailed(db, image, "no download task recorded")
      : unchanged(image);
  }

  const task = await attempt(() =>
    instance.node.tasks.$(image.upid as string).status.$get(),
  );

  if (task === FAILED) {
    // Unreachable node, or the task has been rotated out of the task index and
    // can never be resolved again.
    return isStale
      ? markFailed(db, image, "download task could not be read")
      : unchanged(image);
  }

  if (task.status === "running") {
    return unchanged(image);
  }

  if (task.status !== "stopped") {
    Sentry.captureMessage(
      `[reconcileTemplateImage] Unhandled task status "${task.status}" for ${image.volid}.`,
    );

    return isStale
      ? markFailed(db, image, `unhandled task status "${task.status}"`)
      : unchanged(image);
  }

  if (task.exitstatus !== "OK") {
    // Stored verbatim: Proxmox distinguishes a checksum mismatch (which names
    // both digests) from a transport failure, and those are different operator
    // problems. Unlike vzdump there is no partial-success case - a download
    // that did not end in OK left no file, because Proxmox renames from
    // `.tmp_dwnl.<pid>` only on success.
    return markFailed(
      db,
      image,
      task.exitstatus ?? "download failed for an unknown reason",
    );
  }

  // The task succeeded. Confirm the volume is actually listed before calling
  // the image usable - `import-from` would fail later otherwise, in the middle
  // of provisioning, where it is far more expensive.
  const contents = await attempt(() =>
    instance.node.storage.$(image.storage).content.$get({ content: "import" }),
  );

  if (contents === FAILED) {
    return isStale
      ? markFailed(db, image, "import storage could not be listed")
      : unchanged(image);
  }

  const entry = contents.find((entry) => entry.volid === image.volid);

  if (!entry) {
    Sentry.captureMessage(
      `[reconcileTemplateImage] Task reported OK but ${image.volid} is not on storage "${image.storage}".`,
    );

    // No grace period, unlike backups: the download task only reports OK after
    // the rename, so a missing volume here means it was removed rather than
    // not yet visible.
    return markFailed(db, image, "downloaded volume is not on the storage");
  }

  return settle(db, image, {
    downloadedAt: new Date(),
    failedAt: null,
    lastError: null,
    sizeBytes: entry.size,
  });
}
