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

import * as z from "zod";
import { ProxmoxTemplateSchema } from "../proxmox-template";
import { ProxmoxTemplateGroupSchema } from "./proxmox-template-group";

export const CHECKSUM_ALGORITHMS = [
  "md5",
  "sha1",
  "sha224",
  "sha256",
  "sha384",
  "sha512",
] as const;

export const TEMPLATE_ARCHITECTURES = ["amd64", "arm64"] as const;

export const TEMPLATE_OS_FAMILIES = [
  "debian",
  "ubuntu",
  "rhel",
  "fedora",
  "alpine",
  "freebsd",
  "windows",
] as const;

export const TEMPLATE_PACKAGE_MANAGERS = [
  "apt",
  "dnf",
  "yum",
  "apk",
  "pkg",
] as const;

export const TEMPLATE_INIT_SYSTEMS = ["systemd", "openrc", "bsd-rc"] as const;

/**
 * The image definition and guest metadata. Deliberately not part of the public
 * `ProxmoxTemplateSchema`: a customer picking an operating system has no
 * business seeing which mirror it is fetched from.
 */
export const ProxmoxTemplateImageFieldsSchema = z.object({
  enabled: z.boolean().default(true).meta({
    description: "Whether the template may be offered to customers.",
  }),
  image_url: z.url().meta({
    description:
      "Direct https URL to the cloud image. Required - a template is a declaration of an image.",
    examples: [
      "https://cloud.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2",
    ],
  }),
  image_checksum: z
    .string()
    .regex(/^[a-fA-F0-9]+$/, "Must be a hex digest")
    .nullable()
    .meta({
      description:
        "Expected checksum of the image. Leave empty for a `-latest-` URL the vendor repoints in place.",
    }),
  image_checksum_algorithm: z.enum(CHECKSUM_ALGORITHMS).nullable(),
  /**
   * Decompression to apply on the node. Inferred from the URL when null, which
   * is why it has no field in the admin console.
   */
  image_compression: z.string().nullable().default(null),
  image_refresh_days: z.number().int().positive().nullable(),
  architecture: z.enum(TEMPLATE_ARCHITECTURES).default("amd64"),
  os_family: z.enum(TEMPLATE_OS_FAMILIES).nullable(),
  os_version: z
    .string()
    .max(32)
    .nullable()
    .meta({ examples: ["13", "24.04"] }),
  package_manager: z.enum(TEMPLATE_PACKAGE_MANAGERS).nullable(),
  init_system: z.enum(TEMPLATE_INIT_SYSTEMS).nullable(),
  ostype: z.string().min(1).max(32).default("l26"),
  cpu_type: z.string().min(1).max(64).default("host"),
  bios_type: z.string().min(1).max(16).default("seabios"),
  machine: z.string().min(1).max(32).default("q35"),
});

/**
 * A checksum without its algorithm is not usable by Proxmox, and an algorithm
 * without a checksum is meaningless - so the pair is validated together rather
 * than field by field, where neither could see the other.
 */
const withConsistentChecksum = <T extends z.ZodType>(schema: T) =>
  schema.refine(
    (value) => {
      const v = value as {
        image_checksum?: string | null;
        image_checksum_algorithm?: string | null;
      };
      return !!v.image_checksum === !!v.image_checksum_algorithm;
    },
    {
      message: "A checksum and its algorithm must be set together",
      path: ["image_checksum_algorithm"],
    },
  );

export const CreateProxmoxTemplateInputSchema = withConsistentChecksum(
  ProxmoxTemplateSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
  })
    .extend({
      proxmox_template_group_id: ProxmoxTemplateGroupSchema.shape.id,
    })
    .extend(ProxmoxTemplateImageFieldsSchema.shape),
);

export type CreateProxmoxTemplateInput = z.infer<
  typeof CreateProxmoxTemplateInputSchema
>;

export const CreateProxmoxTemplateOutputSchema = z.void();

export type CreateProxmoxTemplateOutput = z.infer<
  typeof CreateProxmoxTemplateOutputSchema
>;

export const UpdateProxmoxTemplateInputSchema = withConsistentChecksum(
  ProxmoxTemplateSchema.omit({
    created_at: true,
    updated_at: true,
  })
    .extend({
      proxmox_template_group_id: ProxmoxTemplateGroupSchema.shape.id,
    })
    .extend(ProxmoxTemplateImageFieldsSchema.shape),
);

export type UpdateProxmoxTemplateInput = z.infer<
  typeof UpdateProxmoxTemplateInputSchema
>;

export const DeleteProxmoxTemplateInputSchema = z.object({
  id: ProxmoxTemplateSchema.shape.id,
});

export type DeleteProxmoxTemplateInput = z.infer<
  typeof DeleteProxmoxTemplateInputSchema
>;

/** Kicks off a download of one template's image onto every node. */
export const DownloadProxmoxTemplateImageInputSchema = z.object({
  id: ProxmoxTemplateSchema.shape.id,
  force: z.boolean().default(false),
});

export type DownloadProxmoxTemplateImageInput = z.infer<
  typeof DownloadProxmoxTemplateImageInputSchema
>;
