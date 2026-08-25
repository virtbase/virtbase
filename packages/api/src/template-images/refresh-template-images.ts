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
import type { db as database } from "@virtbase/db/client";
import { proxmoxNodes, proxmoxTemplates } from "@virtbase/db/schema";
import { getProxmoxInstance } from "../proxmox";
import type { EnsureTemplateImageResult } from "./ensure-template-image";
import { ensureTemplateImage } from "./ensure-template-image";

type Database = typeof database;

export interface RefreshTemplateImagesResult {
  ready: number;
  downloading: number;
  failed: number;
  /** Template/node pairs considered, before any work was decided. */
  considered: number;
}

export interface RefreshTemplateImagesParams {
  db: Database;
  /** Injectable so tests do not have to reach a real node. */
  createInstance?: typeof getProxmoxInstance;
}

/**
 * Warms every enabled template's image onto every node's import storage, and
 * settles whatever downloads are already in flight.
 *
 * This is what makes availability mean something: without it, the first
 * customer to pick a freshly added template would pay for the download inside
 * their provisioning run. `ensureTemplateImage` is idempotent and reconciles
 * before it decides, so a pass that overlaps a provisioning run costs a storage
 * listing rather than a second download.
 *
 * Nodes that share one storage are walked in order so the image is fetched
 * once rather than once per node; independent storages run in parallel, so one
 * unreachable node cannot starve the others.
 */
export async function refreshTemplateImages({
  db,
  createInstance = getProxmoxInstance,
}: RefreshTemplateImagesParams): Promise<RefreshTemplateImagesResult> {
  const [templates, nodes] = await db.transaction(
    async (tx) => {
      const templates = await tx
        .select({
          id: proxmoxTemplates.id,
          name: proxmoxTemplates.name,
          imageUrl: proxmoxTemplates.imageUrl,
          imageChecksum: proxmoxTemplates.imageChecksum,
          imageChecksumAlgorithm: proxmoxTemplates.imageChecksumAlgorithm,
          imageCompression: proxmoxTemplates.imageCompression,
          imageRefreshDays: proxmoxTemplates.imageRefreshDays,
        })
        .from(proxmoxTemplates)
        .where(eq(proxmoxTemplates.enabled, true));

      const nodes = await tx
        .select({
          id: proxmoxNodes.id,
          hostname: proxmoxNodes.hostname,
          fqdn: proxmoxNodes.fqdn,
          // [!] Sensitive data
          tokenID: proxmoxNodes.tokenID,
          tokenSecret: proxmoxNodes.tokenSecret,
          importStorage: proxmoxNodes.importStorage,
        })
        .from(proxmoxNodes);

      return [templates, nodes] as const;
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  // A template with no image URL is half-declared: it cannot be provisioned and
  // must not be downloaded. Filtered here rather than in SQL so the count of
  // what was skipped stays visible in the logs.
  const withImages = templates.filter(
    (template): template is (typeof templates)[number] & { imageUrl: string } =>
      !!template.imageUrl,
  );

  // Nodes that look at the *same* shared storage must not each download the
  // same image onto it. `ensureTemplateImage` adopts a volume that is already
  // present, but that only helps once the first download has landed - on a cold
  // pass all of them would check at the same moment, all see nothing, and all
  // start fetching the same few hundred megabytes.
  //
  // So nodes sharing one storage form a group and are walked in order: the
  // first downloads, the rest adopt. Groups still run in parallel, which is
  // what keeps one unreachable node from starving the others.
  const groups = new Map<string, typeof nodes>();
  for (const node of nodes) {
    const instance = createInstance(node);
    const key = (await isSharedStorage(instance, node.importStorage))
      ? `shared:${node.importStorage}`
      : `node:${node.id}`;

    const existing = groups.get(key);
    if (existing) {
      existing.push(node);
    } else {
      groups.set(key, [node]);
    }
  }

  const results = await Promise.all(
    [...groups.values()].map(async (group) => {
      const counts = { ready: 0, downloading: 0, failed: 0 };

      // Templates outer, nodes inner: within a group only *one* node may fetch
      // a given image. Serialising the nodes is not enough on its own, because
      // starting a download returns immediately - the second node would look
      // for a file that is still a `.tmp_dwnl` and start its own.
      for (const template of withImages) {
        let allowDownload = true;

        for (const node of group) {
          const instance = createInstance(node);

          let result: EnsureTemplateImageResult;
          try {
            result = await ensureTemplateImage({
              db,
              instance,
              proxmoxNodeId: node.id,
              storage: node.importStorage,
              template,
              allowDownload,
            });
          } catch (error) {
            // `ensureTemplateImage` swallows Proxmox failures itself, so this
            // only fires on unexpected errors - keep going with the rest.
            console.error(error);
            Sentry.captureException(error);
            counts.failed++;
            continue;
          }

          // Once a node has the image or is fetching it, the rest of the group
          // adopts rather than downloads. A failure leaves the slot open so the
          // next node still gets a chance.
          if (result.status !== "failed") allowDownload = false;

          if (result.status === "failed") {
            console.warn(
              `[refreshTemplateImages] ${template.name} on ${node.hostname}: ${result.reason}`,
            );
          }

          counts[result.status]++;
        }
      }

      return counts;
    }),
  );

  return results.reduce<RefreshTemplateImagesResult>(
    (total, counts) => ({
      ready: total.ready + counts.ready,
      downloading: total.downloading + counts.downloading,
      failed: total.failed + counts.failed,
      considered: total.considered,
    }),
    {
      ready: 0,
      downloading: 0,
      failed: 0,
      considered: withImages.length * nodes.length,
    },
  );
}

/**
 * Whether a storage is shared across the cluster, as Proxmox reports it.
 *
 * A node that cannot be reached answers `false`, which degrades to treating the
 * storage as node-local: at worst that costs a duplicate download, whereas a
 * wrong `true` would have one node adopt a volume another node cannot see.
 */
async function isSharedStorage(
  instance: ReturnType<typeof getProxmoxInstance>,
  storage: string,
): Promise<boolean> {
  try {
    const entries = await instance.node.storage.$get({ enabled: true });

    return !!entries.find((entry) => entry.storage === storage)?.shared;
  } catch (error) {
    Sentry.captureException(error);

    return false;
  }
}
