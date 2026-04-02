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
import { ObjectTimestampSchema } from "./timestamps";

export const ProxmoxTemplateSchema = z.object({
  id: z
    .string()
    .regex(/^temp_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the Proxmox template.",
      examples: ["temp_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  icon: z
    .url()
    .nullable()
    .meta({
      description: "The icon image URL of the Proxmox template.",
      examples: ["https://example.com/icon.png"],
    }),
  name: z
    .string()
    .min(1)
    .max(64)
    .meta({
      description: "Displayable name of the Proxmox template.",
      examples: ["Debian 12 (Bookworm)"],
    }),
  required_cores: z
    .number()
    .int()
    .positive()
    .nullable()
    .meta({
      description: "The required number of cores for the Proxmox template.",
      examples: [1, 2, 4, 8],
    }),
  recommended_cores: z
    .number()
    .int()
    .positive()
    .nullable()
    .meta({
      description: "The recommended number of cores for the Proxmox template.",
      examples: [1, 2, 4, 8],
    }),
  recommended_memory: z
    .number()
    .int()
    .positive()
    .nullable()
    .meta({
      description: "The recommended memory for the Proxmox template in MiB.",
      examples: [1024, 2048, 4096, 8192],
    }),
  required_memory: z
    .number()
    .int()
    .positive()
    .nullable()
    .meta({
      description: "The required memory for the Proxmox template in MiB.",
      examples: [1024, 2048, 4096, 8192],
    }),
  recommended_storage: z
    .number()
    .int()
    .positive()
    .nullable()
    .meta({
      description: "The recommended storage for the Proxmox template in GiB.",
      examples: [100, 200, 400, 800],
    }),
  required_storage: z
    .number()
    .int()
    .positive()
    .nullable()
    .meta({
      description: "The required storage for the Proxmox template in GiB.",
      examples: [100, 200, 400, 800],
    }),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type ProxmoxTemplate = z.infer<typeof ProxmoxTemplateSchema>;
