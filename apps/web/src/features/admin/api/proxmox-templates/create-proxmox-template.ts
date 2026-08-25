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
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxTemplates } from "@virtbase/db/schema";
import {
  CreateProxmoxTemplateInputSchema,
  CreateProxmoxTemplateOutputSchema,
  DeleteProxmoxTemplateInputSchema,
  UpdateProxmoxTemplateInputSchema,
} from "@virtbase/validators/admin";
import { revalidatePath, revalidateTag } from "next/cache";
import { actionClient } from "../../lib/action-client";

/**
 * Maps the snake_case wire shape onto the camelCase columns. One place, so a
 * new field is added to the schema and here and nowhere else.
 */
const toColumns = (input: {
  name: string;
  icon: string | null;
  enabled: boolean;
  required_cores: number | null;
  recommended_cores: number | null;
  required_memory: number | null;
  recommended_memory: number | null;
  required_storage: number | null;
  recommended_storage: number | null;
  proxmox_template_group_id: string;
  image_url: string;
  image_checksum: string | null;
  image_checksum_algorithm:
    | "md5"
    | "sha1"
    | "sha224"
    | "sha256"
    | "sha384"
    | "sha512"
    | null;
  image_compression: string | null;
  image_refresh_days: number | null;
  architecture: "amd64" | "arm64";
  os_family:
    | "debian"
    | "ubuntu"
    | "rhel"
    | "fedora"
    | "alpine"
    | "freebsd"
    | "windows"
    | null;
  os_version: string | null;
  package_manager: "apt" | "dnf" | "yum" | "apk" | "pkg" | null;
  init_system: "systemd" | "openrc" | "bsd-rc" | null;
  ostype: string;
  cpu_type: string;
  bios_type: string;
  machine: string;
}) => ({
  name: input.name,
  icon: input.icon,
  enabled: input.enabled,
  requiredCores: input.required_cores,
  recommendedCores: input.recommended_cores,
  requiredMemory: input.required_memory,
  recommendedMemory: input.recommended_memory,
  requiredStorage: input.required_storage,
  recommendedStorage: input.recommended_storage,
  proxmoxTemplateGroupId: input.proxmox_template_group_id,
  imageUrl: input.image_url,
  imageChecksum: input.image_checksum,
  imageChecksumAlgorithm: input.image_checksum_algorithm,
  imageCompression: input.image_compression,
  imageRefreshDays: input.image_refresh_days,
  architecture: input.architecture,
  osFamily: input.os_family,
  osVersion: input.os_version,
  packageManager: input.package_manager,
  initSystem: input.init_system,
  ostype: input.ostype,
  cpuType: input.cpu_type,
  biosType: input.bios_type,
  machine: input.machine,
});

const revalidate = () => {
  revalidateTag("proxmox-template-groups", "max");
  revalidateTag("proxmox-templates", "max");
  revalidateTag("checkout", "max");
  revalidatePath("/admin.virtbase.com");
};

export const createProxmoxTemplateAction = actionClient
  .inputSchema(CreateProxmoxTemplateInputSchema)
  .outputSchema(CreateProxmoxTemplateOutputSchema)
  .action(async ({ parsedInput }) => {
    try {
      await db.transaction(
        async (tx) => {
          await tx.insert(proxmoxTemplates).values(toColumns(parsedInput));
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
          "Failed to insert Proxmox template into the database. Please try again later.",
      });
    }

    revalidate();
  });

export const updateProxmoxTemplateAction = actionClient
  .inputSchema(UpdateProxmoxTemplateInputSchema)
  .action(async ({ parsedInput }) => {
    try {
      await db.transaction(
        async (tx) => {
          await tx
            .update(proxmoxTemplates)
            .set(toColumns(parsedInput))
            .where(eq(proxmoxTemplates.id, parsedInput.id));
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
          "Failed to update the Proxmox template. Please try again later.",
      });
    }

    // The image rows are deliberately left alone. A changed URL or checksum is
    // noticed by `ensureTemplateImage`, which downloads to a *different*
    // content-addressed filename - deleting rows here would strand the volume.
    revalidate();
    revalidateTag("proxmox-template-images", "max");
  });

export const deleteProxmoxTemplateAction = actionClient
  .inputSchema(DeleteProxmoxTemplateInputSchema)
  .action(async ({ parsedInput }) => {
    try {
      await db.transaction(
        async (tx) => {
          await tx
            .delete(proxmoxTemplates)
            .where(eq(proxmoxTemplates.id, parsedInput.id));
        },
        {
          accessMode: "read write",
          isolationLevel: "read committed",
        },
      );
    } catch {
      // A template a server still references cannot be deleted, and the
      // foreign key is what says so.
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Failed to delete the template. A server or backup may still reference it.",
      });
    }

    revalidate();
  });
