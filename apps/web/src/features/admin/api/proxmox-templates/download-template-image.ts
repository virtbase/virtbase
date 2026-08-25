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

"use server";

import { TRPCError } from "@trpc/server";
import { getProxmoxInstance } from "@virtbase/api/proxmox";
import { ensureTemplateImage } from "@virtbase/api/template-images";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes, proxmoxTemplates } from "@virtbase/db/schema";
import { DownloadProxmoxTemplateImageInputSchema } from "@virtbase/validators/admin";
import { revalidatePath, revalidateTag } from "next/cache";
import { actionClient } from "../../lib/action-client";

/**
 * Downloads one template's image onto every node, now, rather than waiting for
 * the hourly cron.
 *
 * Only starts the downloads - a few hundred megabytes per node is far longer
 * than a request should live, and the reconciler settles the rows either way.
 * Nothing polls for the result: the next page load shows where things got to,
 * and an operator who kicked off a download does not need to watch it.
 */
export const downloadTemplateImageAction = actionClient
  .inputSchema(DownloadProxmoxTemplateImageInputSchema)
  .action(async ({ parsedInput: { id, force } }) => {
    const template = await db
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
      .where(eq(proxmoxTemplates.id, id))
      .limit(1)
      .then(([row]) => row);

    if (!template) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (!template.imageUrl) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This template has no image URL to download.",
      });
    }

    const nodes = await db.select().from(proxmoxNodes);

    if (nodes.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "There are no Proxmox nodes to download the image to.",
      });
    }

    // Sequential, and only the first node is allowed to download when several
    // share one storage - the same rule the refresh cron uses, for the same
    // reason: otherwise every node fetches the identical file onto it.
    const failures: string[] = [];
    let allowDownload = true;

    for (const node of nodes) {
      const instance = getProxmoxInstance(node);

      const result = await ensureTemplateImage({
        db,
        instance,
        proxmoxNodeId: node.id,
        storage: node.importStorage,
        template,
        force,
        allowDownload,
      });

      if (result.status === "failed") {
        failures.push(`${node.hostname}: ${result.reason}`);
      } else {
        allowDownload = false;
      }
    }

    revalidateTag("proxmox-template-images", "max");
    revalidatePath("/admin.virtbase.com");

    if (failures.length === nodes.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: failures[0] ?? "The image could not be downloaded.",
      });
    }

    return { started: nodes.length - failures.length, failures };
  });
