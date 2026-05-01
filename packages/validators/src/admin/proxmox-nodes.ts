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

import z from "zod";
import { ObjectTimestampSchema } from "../timestamps";
import { DatacenterSchema } from "./datacenters";
import { ProxmoxNodeGroupSchema } from "./proxmox-node-group";

export const ProxmoxNodeSchema = z.object({
  id: z
    .string()
    .regex(/^pn_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the Proxmox node.",
      examples: ["pn_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  datacenter_id: DatacenterSchema.shape.id,
  proxmox_node_group_id: ProxmoxNodeGroupSchema.shape.id,
  hostname: z.hostname().meta({
    description: "The hostname of the Proxmox node.",
    examples: ["epyc01"],
    internal: true,
  }),
  fqdn: z.hostname().meta({
    description: "The FQDN of the Proxmox node.",
    examples: ["epyc01.example.com"],
    internal: true,
  }),
  token_id: z
    .string()
    .regex(/^.*@.+!.+$/)
    .meta({
      description: "The API token ID of the Proxmox node.",
      examples: ["api@pam!virtbase"],
      internal: true,
    }),
  token_secret: z.uuidv4().meta({
    description: "The API token secret of the Proxmox node.",
    examples: ["f7d62f02-eb10-413e-b8f1-6dd8a9902885"],
    internal: true,
  }),
  storage_description: z
    .string()
    .nullish()
    .meta({
      description: "The description of the storage of the Proxmox node.",
      examples: ["Samsung PM9A1 1TB NVMe SSD"],
    }),
  memory_description: z
    .string()
    .nullish()
    .meta({
      description: "The description of the memory of the Proxmox node.",
      examples: ["Samsung 16GB DDR4-2666MHz"],
    }),
  cpu_description: z
    .string()
    .nullish()
    .meta({
      description: "The description of the CPU of the Proxmox node.",
      examples: ["AMD EPYC 7443P"],
    }),
  netrate: z
    .number()
    .int()
    .nullish()
    .meta({
      description:
        "The maximum possible network bandwidth of the Proxmox node in MB/s.",
      examples: [1000],
    }),
  guest_limit: z
    .number()
    .int()
    .nullish()
    .meta({
      description:
        "The maximum number of guests that can be running on the Proxmox node.",
      examples: [10],
      internal: true,
    }),
  memory_limit: z
    .number()
    .int()
    .nullish()
    .meta({
      description:
        "The maximum memory that can be used on the Proxmox node in MiB.",
      examples: [1024],
      internal: true,
    }),
  storage_limit: z
    .number()
    .int()
    .nullish()
    .meta({
      description:
        "The maximum storage that can be used on the Proxmox node in GiB.",
      examples: [100],
      internal: true,
    }),
  netrate_limit: z
    .number()
    .int()
    .nullish()
    .meta({
      description:
        "The maximum network bandwidth that can be used on the Proxmox node in MB/s.",
      examples: [1000],
      internal: true,
    }),
  cores_limit: z
    .number()
    .int()
    .nullish()
    .meta({
      description:
        "The maximum number of vCores that can be used on the Proxmox node.",
      examples: [10],
      internal: true,
    }),
  snippet_storage: z
    .string()
    .min(1)
    .meta({
      description:
        "The name of the storage used for custom cloud-init snippets.",
      examples: ["local-lvm"],
      internal: true,
    }),
  backup_storage: z
    .string()
    .min(1)
    .meta({
      description: "The name of the storage used for backups.",
      examples: ["local-lvm"],
      internal: true,
    }),
  iso_download_storage: z
    .string()
    .min(1)
    .meta({
      description: "The name of the storage used for ISO image downloads.",
      examples: ["local-lvm"],
      internal: true,
    }),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type ProxmoxNode = z.infer<typeof ProxmoxNodeSchema>;

export const CreateProxmoxNodeInputSchema = ProxmoxNodeSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type CreateProxmoxNodeInput = z.infer<
  typeof CreateProxmoxNodeInputSchema
>;
