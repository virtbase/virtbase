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
import { and, eq } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import { proxmoxTemplateImages } from "@virtbase/db/schema";
import {
  deriveTemplateImageFilename,
  isTemplateImageFresh,
  resolveImageCompression,
} from "@virtbase/utils";
import type { ProxmoxInstance } from "../proxmox";
import type { TemplateImageReconciliation } from "./reconcile-template-image";
import { reconcileTemplateImage } from "./reconcile-template-image";
import { assertSafeImageUrl } from "./safe-image-url";

type Database = typeof database;

/**
 * The template fields the image lifecycle needs. Deliberately a structural
 * subset rather than the whole row, so callers can select narrowly.
 */
export interface TemplateImageDefinition {
  id: string;
  imageUrl: string | null;
  imageChecksum: string | null;
  imageChecksumAlgorithm:
    | "md5"
    | "sha1"
    | "sha224"
    | "sha256"
    | "sha384"
    | "sha512"
    | null;
  imageCompression: string | null;
  imageRefreshDays: number | null;
}

export interface EnsureTemplateImageParams {
  db: Database;
  instance: ProxmoxInstance;
  proxmoxNodeId: string;
  /** The node's `importStorage`. */
  storage: string;
  template: TemplateImageDefinition;
  /**
   * When true, re-download even if the current image is still fresh. Drives the
   * admin console's explicit "Download now".
   */
  force?: boolean;
  /**
   * When false, adopt an image that is already on the storage but never start a
   * download.
   *
   * This is how a shared storage avoids fetching the same bytes once per node:
   * one node downloads, the rest wait and adopt the volume on a later pass.
   * Starting a download here would not merely waste bandwidth - it would record
   * a UPID belonging to another node, which reconciliation cannot resolve,
   * because Proxmox scopes task lookups to the node that owns the task.
   */
  allowDownload?: boolean;
}

export type EnsureTemplateImageResult =
  /** Ready to be used as an `import-from` source. */
  | { status: "ready"; volid: string; downloadedAt: Date }
  /** A download is in flight; poll `upid` or wait for the next reconciliation. */
  | { status: "downloading"; volid: string; upid: string | null }
  /** Terminal failure; `reason` is Proxmox's own message where there is one. */
  | { status: "failed"; reason: string };

/**
 * Makes a template's image present and fresh on one node's import storage,
 * and reports whether it can be used yet.
 *
 * Idempotent and cheap in the common case: an image that is already settled and
 * fresh costs one storage listing. Safe to call from the provisioning workflow
 * and from the refresh cron at the same time - the row's composite primary key
 * makes a concurrent insert a conflict rather than a duplicate download.
 *
 * Never throws for a Proxmox failure; the caller decides what an unavailable
 * image means in its context.
 */
export async function ensureTemplateImage({
  db,
  instance,
  proxmoxNodeId,
  storage,
  template,
  force = false,
  allowDownload = true,
}: EnsureTemplateImageParams): Promise<EnsureTemplateImageResult> {
  if (!template.imageUrl) {
    return {
      status: "failed",
      reason: "template has no image URL",
    };
  }

  const where = and(
    eq(proxmoxTemplateImages.proxmoxTemplateId, template.id),
    eq(proxmoxTemplateImages.proxmoxNodeId, proxmoxNodeId),
    eq(proxmoxTemplateImages.storage, storage),
  );

  const existing = await db
    .select({
      proxmoxTemplateId: proxmoxTemplateImages.proxmoxTemplateId,
      proxmoxNodeId: proxmoxTemplateImages.proxmoxNodeId,
      storage: proxmoxTemplateImages.storage,
      volid: proxmoxTemplateImages.volid,
      upid: proxmoxTemplateImages.upid,
      checksum: proxmoxTemplateImages.checksum,
      createdAt: proxmoxTemplateImages.createdAt,
      downloadedAt: proxmoxTemplateImages.downloadedAt,
      failedAt: proxmoxTemplateImages.failedAt,
      lastError: proxmoxTemplateImages.lastError,
    })
    .from(proxmoxTemplateImages)
    .where(where)
    .limit(1)
    .then(([row]) => row);

  // 1. Settle whatever is in flight before deciding anything. Reconciling first
  //    is what keeps a download started by a workflow from being restarted by
  //    the cron a minute later.
  let settled: TemplateImageReconciliation | null = null;
  if (existing && !existing.downloadedAt && !existing.failedAt) {
    settled = await reconcileTemplateImage({
      db,
      instance,
      image: existing,
    });

    if (!settled.downloadedAt && !settled.failedAt) {
      // Still running - nothing else to do this pass.
      return {
        status: "downloading",
        volid: existing.volid,
        upid: existing.upid,
      };
    }
  }

  const downloadedAt = settled?.downloadedAt ?? existing?.downloadedAt ?? null;
  const storedChecksum = existing?.checksum ?? null;

  // 2. A settled, fresh image whose bytes are still on the storage is the
  //    common case and must stay cheap.
  if (!force && existing && downloadedAt) {
    const fresh = isTemplateImageFresh({
      downloadedAt,
      refreshDays: template.imageRefreshDays,
      storedChecksum,
      expectedChecksum: template.imageChecksum,
    });

    if (fresh && (await volumeExists(instance, storage, existing.volid))) {
      return { status: "ready", volid: existing.volid, downloadedAt };
    }
  }

  // 3. A row that failed and is not yet due for a retry stays failed, so a
  //    broken URL is not re-attempted on every workflow run.
  if (!force && existing?.failedAt && !isRetryDue(existing.failedAt)) {
    return {
      status: "failed",
      reason: existing.lastError ?? "previous download failed",
    };
  }

  const filenameNow = deriveTemplateImageFilename({
    templateId: template.id,
    imageUrl: template.imageUrl,
    checksum: template.imageChecksum,
  });
  const targetVolid = `${storage}:import/${filenameNow}`;

  // 4. Adopt bytes that are already there rather than fetching them again.
  //
  //    This is what makes a shared import storage behave sanely: every node of
  //    a cluster points at the same CephFS, so once any one of them has
  //    downloaded the image the others must record it, not re-download several
  //    hundred megabytes onto a file that already exists. It also picks up an
  //    image an operator placed by hand.
  //
  //    Safe on non-shared storage too, because the check is "is this volume
  //    visible from *this* node", which is exactly the question that matters.
  if (!force && (await volumeExists(instance, storage, targetVolid))) {
    const adopted = await recordSettled({
      db,
      proxmoxNodeId,
      storage,
      templateId: template.id,
      volid: targetVolid,
      checksum: template.imageChecksum,
      sizeBytes: await volumeSize(instance, storage, targetVolid),
    });

    return { status: "ready", volid: targetVolid, downloadedAt: adopted };
  }

  // 5. Another node of this shared storage is fetching it. Report the image as
  //    in flight without a task of our own; the next pass adopts the volume.
  if (!allowDownload) {
    return { status: "downloading", volid: targetVolid, upid: null };
  }

  // 6. Download. Re-validated immediately before the URL is handed to Proxmox
  //    so a late DNS change to a blocked address fails closed.
  try {
    await assertSafeImageUrl(template.imageUrl);
  } catch (error) {
    return {
      status: "failed",
      reason:
        error instanceof Error ? error.message : "image URL is not allowed",
    };
  }

  const filename = filenameNow;
  const volid = targetVolid;

  // An explicit compression column wins; otherwise infer it from the URL so a
  // `.zst` image does not have to be configured twice.
  const compression =
    template.imageCompression ?? resolveImageCompression(template.imageUrl);

  let upid: string;
  try {
    upid = await instance.downloadUrl({
      storage,
      content: "import",
      filename,
      url: template.imageUrl,
      ...(template.imageChecksum && template.imageChecksumAlgorithm
        ? {
            checksum: template.imageChecksum,
            checksumAlgorithm: template.imageChecksumAlgorithm,
          }
        : {}),
      ...(compression ? { compression } : {}),
    });
  } catch (error) {
    Sentry.captureException(error);

    return {
      status: "failed",
      reason: "could not start the download on the node",
    };
  }

  // The previous volume is deliberately *not* deleted here. A guest may still
  // be importing from it, and the new download may yet fail - it is removed
  // once this row settles successfully, by the refresh sweep.
  const previousVolid =
    existing && existing.volid !== volid ? existing.volid : null;

  await db
    .insert(proxmoxTemplateImages)
    .values({
      proxmoxTemplateId: template.id,
      proxmoxNodeId,
      storage,
      volid,
      upid,
      checksum: template.imageChecksum,
      downloadedAt: null,
      failedAt: null,
      lastError: null,
      sizeBytes: null,
    })
    .onConflictDoUpdate({
      target: [
        proxmoxTemplateImages.proxmoxTemplateId,
        proxmoxTemplateImages.proxmoxNodeId,
        proxmoxTemplateImages.storage,
      ],
      set: {
        volid,
        upid,
        checksum: template.imageChecksum,
        downloadedAt: null,
        failedAt: null,
        lastError: null,
        sizeBytes: null,
      },
    });

  if (previousVolid) {
    await deleteVolume(instance, storage, previousVolid);
  }

  return { status: "downloading", volid, upid };
}

/**
 * How long a failed row is left alone before another attempt. Short enough that
 * a fixed URL recovers on the next cron pass, long enough that a genuinely
 * broken template is not retried on every provisioning attempt.
 */
const FAILED_RETRY_AFTER_MINUTES = 30;

const isRetryDue = (failedAt: Date) =>
  Date.now() - failedAt.getTime() >= FAILED_RETRY_AFTER_MINUTES * 60_000;

/**
 * Whether the recorded volume is still on the storage. A `false` here is how an
 * image removed outside of Virtbase gets re-downloaded rather than failing much
 * later, inside `import-from`.
 *
 * An unreachable node answers `true`: refusing to use an image because the node
 * did not answer would turn a transient blip into an unavailable template.
 */
async function volumeExists(
  instance: ProxmoxInstance,
  storage: string,
  volid: string,
): Promise<boolean> {
  try {
    const contents = await instance.node.storage
      .$(storage)
      .content.$get({ content: "import" });

    return contents.some((entry) => entry.volid === volid);
  } catch (error) {
    Sentry.captureException(error);

    return true;
  }
}

/**
 * Records an image that is already on the storage as settled, without a
 * download task. Used when adopting bytes another node fetched onto a shared
 * storage, or that an operator placed by hand.
 */
async function recordSettled({
  db,
  proxmoxNodeId,
  storage,
  templateId,
  volid,
  checksum,
  sizeBytes,
}: {
  db: Database;
  proxmoxNodeId: string;
  storage: string;
  templateId: string;
  volid: string;
  checksum: string | null;
  sizeBytes: number | null;
}): Promise<Date> {
  const downloadedAt = new Date();

  await db
    .insert(proxmoxTemplateImages)
    .values({
      proxmoxTemplateId: templateId,
      proxmoxNodeId,
      storage,
      volid,
      upid: null,
      checksum,
      downloadedAt,
      failedAt: null,
      lastError: null,
      sizeBytes,
    })
    .onConflictDoUpdate({
      target: [
        proxmoxTemplateImages.proxmoxTemplateId,
        proxmoxTemplateImages.proxmoxNodeId,
        proxmoxTemplateImages.storage,
      ],
      set: {
        volid,
        upid: null,
        checksum,
        downloadedAt,
        failedAt: null,
        lastError: null,
        sizeBytes,
      },
    });

  return downloadedAt;
}

/**
 * Size of a volume on the import storage, or null when it cannot be read.
 * Cosmetic - never worth failing an adoption over.
 */
async function volumeSize(
  instance: ProxmoxInstance,
  storage: string,
  volid: string,
): Promise<number | null> {
  try {
    const contents = await instance.node.storage
      .$(storage)
      .content.$get({ content: "import" });

    return contents.find((entry) => entry.volid === volid)?.size ?? null;
  } catch {
    return null;
  }
}

async function deleteVolume(
  instance: ProxmoxInstance,
  storage: string,
  volid: string,
): Promise<void> {
  try {
    await instance.node.storage.$(storage).content.$(volid).$delete();
  } catch (error) {
    // A superseded image left behind wastes space but breaks nothing.
    Sentry.captureException(error);
  }
}
