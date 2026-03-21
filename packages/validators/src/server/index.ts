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
import { PaginationSchema } from "../pagination";
import { ProxmoxTemplateSchema } from "../proxmox-template";
import { preprocessQueryArray } from "../utils";
import type { Server } from "./shared";
import { ServerSchema } from "./shared";

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

const expandSchema = z.enum(["template"]).array().default([]);

export const ListServersInputSchema = z.object({
  // Required for trpc-to-openapi to work correctly
  sort: z.preprocess(
    preprocessQueryArray,
    sortSchema,
  ) as unknown as typeof sortSchema,
  expand: z.preprocess(
    preprocessQueryArray,
    expandSchema,
  ) as unknown as typeof expandSchema,
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
      template: z
        .union([
          ProxmoxTemplateSchema.shape.id,
          ProxmoxTemplateSchema.pick({
            id: true,
            icon: true,
          }).meta({
            description:
              "Only present if the `template` expand is included. The current template of the server.",
          }),
        ])
        .nullable(),
    }),
  ),
  meta: z.object({
    pagination: PaginationSchema,
  }),
});

export const RenameServerInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  name: z.string().min(1).max(255),
});

export const RenameServerOutputSchema = z.void();

export * from "./firewall";
export * from "./graphs";
export * from "./shared";
