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
  id: z.string().regex(/^pn_[A-Z0-9]{25}$/),
  datacenter_id: DatacenterSchema.shape.id,
  proxmox_node_group_id: ProxmoxNodeGroupSchema.shape.id,
  hostname: z.hostname(),
  fqdn: z.hostname(),
  token_id: z.string().regex(/^.*@.+!.+$/),
  token_secret: z.uuidv4(),
  storage_description: z.string().nullish(),
  memory_description: z.string().nullish(),
  cpu_description: z.string().nullish(),
  netrate: z.number().int().nullish(),
  guest_limit: z.number().int().nullish(),
  memory_limit: z.number().int().nullish(),
  storage_limit: z.number().int().nullish(),
  netrate_limit: z.number().int().nullish(),
  cores_limit: z.number().int().nullish(),
  snippet_storage: z.string().min(1),
  backup_storage: z.string().min(1),
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
