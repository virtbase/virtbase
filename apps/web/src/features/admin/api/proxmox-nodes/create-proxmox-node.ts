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
import type { Proxmox } from "@virtbase/api/proxmox";
import { getProxmoxInstance } from "@virtbase/api/proxmox";
import { db } from "@virtbase/db/client";
import { proxmoxNodes } from "@virtbase/db/schema";
import { CreateProxmoxNodeInputSchema } from "@virtbase/validators/admin";
import { revalidatePath, revalidateTag } from "next/cache";
import { actionClient } from "../../lib/action-client";

export const createProxmoxNodeAction = actionClient
  .inputSchema(CreateProxmoxNodeInputSchema)
  .action(async ({ parsedInput }) => {
    const {
      datacenter_id,
      proxmox_node_group_id,
      hostname,
      fqdn,
      token_id,
      token_secret,
      backup_storage,
      snippet_storage,
      netrate,
      cores_limit,
      netrate_limit,
      memory_limit,
      storage_limit,
      guest_limit,
      memory_description,
      storage_description,
      cpu_description,
    } = parsedInput;

    const instance = getProxmoxInstance({
      hostname,
      fqdn,
      tokenID: token_id,
      tokenSecret: token_secret,
    });

    try {
      await instance.node.status.$get();
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Failed to retrieve Proxmox node status. Maybe the credentials are incorrect?",
      });
    }

    // TODO: Check permissions of the token

    let storages: Proxmox.nodesStorageIndex[] | null = null;
    try {
      // Check if storages are available
      storages = await instance.node.storage.$get({
        enabled: true,
      });
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Failed to retrieve Proxmox node storages. Maybe the API token does not have the necessary permissions?",
      });
    }

    const hasValidBackupStorage = storages.some(
      (storage) =>
        storage.storage === backup_storage &&
        storage.active &&
        storage.content.includes("backup"),
    );

    if (!hasValidBackupStorage) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Backup storage \`${backup_storage}\` is not available or not configured correctly.`,
      });
    }

    const hasValidSnippetStorage = storages.some(
      (storage) =>
        storage.storage === snippet_storage &&
        storage.active &&
        storage.content.includes("snippets"),
    );

    if (!hasValidSnippetStorage) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Snippet storage \`${snippet_storage}\` is not available or not configured correctly.`,
      });
    }

    // Test if the snippet upload works
    // (requires a custom patch to be applied to the Proxmox VE node)
    // See: https://bugzilla.proxmox.com/show_bug.cgi?id=2208
    try {
      await instance.uploadSnippet({
        filename: "__temp-create-proxmox-node-test.yml",
        contents:
          "# This is a temporary test snippet. It can safely be deleted.",
        storage: snippet_storage,
      });
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Failed to upload test snippet. Please make sure that the snippet patch is applied to the Proxmox VE node.",
      });
    }

    try {
      await db.transaction(
        async (tx) => {
          await tx.insert(proxmoxNodes).values({
            datacenterId: datacenter_id,
            proxmoxNodeGroupId: proxmox_node_group_id,
            hostname,
            fqdn,
            tokenID: token_id,
            tokenSecret: token_secret,
            backupStorage: backup_storage,
            snippetStorage: snippet_storage,
            netrate,
            coresLimit: cores_limit,
            netrateLimit: netrate_limit,
            memoryLimit: memory_limit,
            storageLimit: storage_limit,
            guestLimit: guest_limit,
            memoryDescription: memory_description,
            storageDescription: storage_description,
            cpuDescription: cpu_description,
          });
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Failed to insert Proxmox node into the database. Please try again later.",
      });
    }

    revalidateTag("proxmox-nodes", "max");
    revalidatePath("/admin.virtbase.com");
  });
