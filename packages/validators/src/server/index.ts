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

import type { SortableColumns } from "@virtbase/db/utils";
import * as z from "zod";
import { DatacenterSchema, ProxmoxNodeSchema } from "../admin";
import { PaginationSchema } from "../pagination";
import { ProxmoxTemplateSchema } from "../proxmox-template";
import { ServerPlanSchema } from "../server-plan";
import { SubnetAllocationSchema } from "../subnet-allocations";
import { SubnetSchema } from "../subnets";
import { preprocessQueryArray } from "../utils";
import type { Server } from "./shared";
import { ServerSchema } from "./shared";

export const ServerExpandSchema = z
  .enum(["template", "plan", "datacenter", "node", "allocations"])
  .array()
  .default([]);

export type ServerExpand = z.infer<typeof ServerExpandSchema>;

const ServerTemplateField = z
  .union([
    ProxmoxTemplateSchema.shape.id,
    ProxmoxTemplateSchema.pick({
      id: true,
      icon: true,
      name: true,
    }).meta({
      description:
        "Only present if the `template` expand is included. The current template of the server.",
    }),
  ])
  .nullable();

const ServerPlanField = z.union([
  ServerPlanSchema.shape.id,
  ServerPlanSchema.pick({
    id: true,
    name: true,
    cores: true,
    memory: true,
    storage: true,
  }).meta({
    description:
      "Only present if the `plan` expand is included. The current plan of the server.",
  }),
]);

const ServerDatacenterField = z.union([
  DatacenterSchema.shape.id,
  DatacenterSchema.pick({
    id: true,
    name: true,
  }).meta({
    description:
      "Only present if the `datacenter` expand is included. The datacenter of the server.",
  }),
]);

const ServerNodeField = z.union([
  ProxmoxNodeSchema.shape.id,
  ProxmoxNodeSchema.pick({
    id: true,
    hostname: true,
    netrate: true,
    storage_description: true,
    memory_description: true,
    cpu_description: true,
  }).meta({
    description:
      "Only present if the `node` expand is included. The node of the server.",
  }),
]);

const ServerAllocationsField = z.union([
  z.array(SubnetAllocationSchema.shape.id),
  z
    .array(
      SubnetAllocationSchema.pick({
        id: true,
      }).extend({
        subnet: SubnetSchema.pick({
          id: true,
          cidr: true,
          gateway: true,
          dns_reverse_zone: true,
        }).extend({
          family: z.union([z.literal(4), z.literal(6)]),
        }),
      }),
    )
    .meta({
      description:
        "Only present if the `allocations` expand is included. The allocations of the server.",
    }),
]);

export const GetServerInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  expand: z.preprocess(
    preprocessQueryArray,
    ServerExpandSchema,
  ) as unknown as typeof ServerExpandSchema,
});

export const GetServerOutputSchema = z.object({
  server: ServerSchema.pick({
    id: true,
    name: true,
    installed_at: true,
    suspended_at: true,
    terminates_at: true,
  }).extend({
    plan: ServerPlanField,
    template: ServerTemplateField,
    datacenter: ServerDatacenterField,
    node: ServerNodeField,
    allocations: ServerAllocationsField,
  }),
});

const sortSchema = z
  .enum<SortableColumns<Server>>([
    "id",
    "id:asc",
    "id:desc",
    "name",
    "name:asc",
    "name:desc",
  ])
  .array()
  .default(["id:asc"]);

export const ListServersInputSchema = z.object({
  // Required for trpc-to-openapi to work correctly
  sort: z.preprocess(
    preprocessQueryArray,
    sortSchema,
  ) as unknown as typeof sortSchema,
  expand: z.preprocess(
    preprocessQueryArray,
    ServerExpandSchema,
  ) as unknown as typeof ServerExpandSchema,
  name: ServerSchema.shape.name.optional(),
  page: PaginationSchema.shape.page,
  per_page: PaginationSchema.shape.per_page,
});

export const ListServersOutputSchema = z.object({
  servers: z.array(
    ServerSchema.pick({
      id: true,
      name: true,
      installed_at: true,
      suspended_at: true,
      terminates_at: true,
    }).extend({
      template: ServerTemplateField,
      plan: ServerPlanField,
      datacenter: ServerDatacenterField,
      node: ServerNodeField,
      allocations: ServerAllocationsField,
    }),
  ),
  meta: z.object({
    pagination: PaginationSchema,
  }),
});

export const RenameServerInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  name: ServerSchema.shape.name,
});

export type RenameServerInput = z.infer<typeof RenameServerInputSchema>;

export const RenameServerOutputSchema = z.void();

export * from "./actions";
export * from "./backups";
export * from "./console";
export * from "./firewall";
export * from "./graphs";
export * from "./pointer-records";
export * from "./shared";
export * from "./status";
