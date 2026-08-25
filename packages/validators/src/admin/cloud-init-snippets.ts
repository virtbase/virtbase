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
import {
  TEMPLATE_ARCHITECTURES,
  TEMPLATE_INIT_SYSTEMS,
  TEMPLATE_OS_FAMILIES,
  TEMPLATE_PACKAGE_MANAGERS,
} from "./proxmox-templates";

export const SNIPPET_KINDS = ["cloud-config", "shell"] as const;
export const SNIPPET_SCOPES = ["base", "optional"] as const;

export const SnippetTargetsSchema = z.object({
  osFamily: z.array(z.enum(TEMPLATE_OS_FAMILIES)).optional(),
  packageManager: z.array(z.enum(TEMPLATE_PACKAGE_MANAGERS)).optional(),
  initSystem: z.array(z.enum(TEMPLATE_INIT_SYSTEMS)).optional(),
  architecture: z.array(z.enum(TEMPLATE_ARCHITECTURES)).optional(),
  osVersionRange: z
    .string()
    .max(64)
    .regex(
      /^\s*((>=|<=|>|<|=)?\s*[A-Za-z0-9.\-_]+)(\s+((>=|<=|>|<|=)?\s*[A-Za-z0-9.\-_]+))*\s*$/,
      "Use comparisons like `>=12` or `>=9 <11`",
    )
    .optional(),
});

export const CloudInitSnippetSchema = z.object({
  id: z.string().regex(/^snip_[A-Z0-9]{25}$/),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Lowercase letters, digits and single hyphens only",
    )
    .meta({
      description:
        "Stable handle, used in logs and as the provenance comment in the composed document.",
      examples: ["base-sshd"],
    }),
  name: z.string().min(1).max(128),
  description: z.string().max(512).nullable(),
  kind: z.enum(SNIPPET_KINDS).default("cloud-config"),
  scope: z.enum(SNIPPET_SCOPES).default("base"),
  content: z
    .string()
    .min(1)
    .max(64 * 1024),
  targets: SnippetTargetsSchema.default({}),
  priority: z.number().int().min(-32768).max(32767).default(0),
  enabled: z.boolean().default(true),
});

export const CreateCloudInitSnippetInputSchema = CloudInitSnippetSchema.omit({
  id: true,
});

export type CreateCloudInitSnippetInput = z.infer<
  typeof CreateCloudInitSnippetInputSchema
>;

export const UpdateCloudInitSnippetInputSchema = CloudInitSnippetSchema;

export type UpdateCloudInitSnippetInput = z.infer<
  typeof UpdateCloudInitSnippetInputSchema
>;

export const DeleteCloudInitSnippetInputSchema = z.object({
  id: CloudInitSnippetSchema.shape.id,
});

export type DeleteCloudInitSnippetInput = z.infer<
  typeof DeleteCloudInitSnippetInputSchema
>;
