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

import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxTemplates } from "@virtbase/db/schema";
import { FatalError, getStepMetadata, RetryableError } from "workflow";
import type { GetProxmoxInstanceParams } from "../../proxmox";
import { getProxmoxInstance } from "../../proxmox";
import { ensureTemplateImage } from "../../template-images";

type GetTemplateStepParams = {
  proxmoxTemplateId: string;
  proxmoxNode: GetProxmoxInstanceParams & { id: string; importStorage: string };
};

/**
 * Resolves a template to the image a guest is built from, making sure that
 * image is actually on the node's import storage first.
 *
 * The cron warms images ahead of time, so this is normally a single storage
 * listing. It still has to handle a cold node - one added since the last
 * refresh, or whose storage was cleared - which is why it can start a download
 * and defer rather than assuming the image is there.
 */
export async function getTemplateStep({
  proxmoxTemplateId,
  proxmoxNode,
}: GetTemplateStepParams) {
  "use step";

  const template = await db.transaction(
    async (tx) => {
      return tx
        .select({
          id: proxmoxTemplates.id,
          name: proxmoxTemplates.name,
          enabled: proxmoxTemplates.enabled,
          imageUrl: proxmoxTemplates.imageUrl,
          imageChecksum: proxmoxTemplates.imageChecksum,
          imageChecksumAlgorithm: proxmoxTemplates.imageChecksumAlgorithm,
          imageCompression: proxmoxTemplates.imageCompression,
          imageRefreshDays: proxmoxTemplates.imageRefreshDays,
          ostype: proxmoxTemplates.ostype,
          cpuType: proxmoxTemplates.cpuType,
          biosType: proxmoxTemplates.biosType,
          machine: proxmoxTemplates.machine,
          architecture: proxmoxTemplates.architecture,
        })
        .from(proxmoxTemplates)
        .where(eq(proxmoxTemplates.id, proxmoxTemplateId))
        .limit(1)
        .then(([res]) => res);
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  if (!template) {
    throw new FatalError(
      `The Proxmox template with ID "${proxmoxTemplateId}" does not exist. Aborting.`,
    );
  }

  if (!template.enabled) {
    throw new FatalError(
      `The Proxmox template "${template.name}" is disabled and cannot be provisioned.`,
    );
  }

  if (!template.imageUrl) {
    // Half-declared: the row exists but nothing says what to build from.
    throw new FatalError(
      `The Proxmox template "${template.name}" has no image URL and cannot be provisioned.`,
    );
  }

  const { importStorage, id: _proxmoxNodeId, ...connection } = proxmoxNode;
  const instance = getProxmoxInstance(connection);

  const image = await ensureTemplateImage({
    db,
    instance,
    proxmoxNodeId: proxmoxNode.id,
    storage: importStorage,
    template,
  });

  if (image.status === "failed") {
    // A bad URL or a checksum that no longer matches is not something a retry
    // fixes - it needs an operator. Proxmox's own message is carried through.
    throw new FatalError(
      `The image for template "${template.name}" could not be downloaded: ${image.reason}`,
    );
  }

  if (image.status === "downloading") {
    const { attempt } = getStepMetadata();

    // Cold node: a few hundred megabytes are on their way. Defer rather than
    // fail - by the next attempt the reconciler will have settled the row.
    throw new RetryableError(
      `The image for template "${template.name}" is still downloading to "${importStorage}". Deferring...`,
      {
        // 30s, 2m, 4m30, 8m, capped at 10 minutes.
        retryAfter: Math.min(attempt ** 2 * 30_000, 10 * 60_000),
      },
    );
  }

  return {
    id: template.id,
    name: template.name,
    volid: image.volid,
    ostype: template.ostype,
    cpuType: template.cpuType,
    biosType: template.biosType,
    machine: template.machine,
    architecture: template.architecture,
  };
}
