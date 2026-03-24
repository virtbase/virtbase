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
import { SubnetAllocationSchema } from "../subnet-allocations";
import { SubnetSchema } from "../subnets";
import { ObjectTimestampSchema } from "../timestamps";
import { preprocessQueryArray } from "../utils";
import { ServerSchema } from ".";

export const PointerRecordSchema = z.object({
  id: z
    .string()
    .regex(/^ipptr_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the PTR record.",
      examples: ["ipptr_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  subnet_allocation_id: SubnetAllocationSchema.shape.id,
  ip: z.union([z.ipv4(), z.ipv6()]).meta({
    description: "IP address of the PTR record, either IPv4 or IPv6.",
    examples: ["192.168.1.1", "2001:db8::1"],
  }),
  hostname: z
    .hostname()
    .lowercase()
    .regex(/^(?!.*(\.|^)localhost$)/)
    .meta({
      description:
        "Resolved hostname of the PTR record. `localhost` is not allowed.",
      examples: ["vm01.example.com"],
    }),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type PointerRecord = z.infer<typeof PointerRecordSchema>;

const PointerRecordExpandSchema = z.enum(["allocation"]).array().default([]);

export type PointerRecordExpand = z.infer<typeof PointerRecordExpandSchema>;

export const GetPointerRecordInputSchema = z.object({
  id: PointerRecordSchema.shape.id,
  server_id: ServerSchema.shape.id,
  expand: z.preprocess(
    preprocessQueryArray,
    PointerRecordExpandSchema,
  ) as unknown as typeof PointerRecordExpandSchema,
});

export type GetPointerRecordInput = z.infer<typeof GetPointerRecordInputSchema>;

export const GetPointerRecordOutputSchema = z.object({
  record: PointerRecordSchema.pick({
    id: true,
    ip: true,
    hostname: true,
    created_at: true,
    updated_at: true,
  }).extend({
    allocation: z.union([
      SubnetAllocationSchema.shape.id,
      SubnetAllocationSchema.pick({
        id: true,
      }).extend({
        subnet: SubnetSchema.pick({
          id: true,
          cidr: true,
          gateway: true,
          dns_reverse_zone: true,
        }),
      }),
    ]),
  }),
});

export type GetPointerRecordOutput = z.infer<
  typeof GetPointerRecordOutputSchema
>;

const sortSchema = z
  .enum<SortableColumns<PointerRecord>>([
    "id",
    "id:asc",
    "id:desc",
    "hostname",
    "hostname:asc",
    "hostname:desc",
  ])
  .array()
  .default(["id:asc"]);

export const ListPointerRecordsInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  // Required for trpc-to-openapi to work correctly
  sort: z.preprocess(
    preprocessQueryArray,
    sortSchema,
  ) as unknown as typeof sortSchema,
  expand: z.preprocess(
    preprocessQueryArray,
    PointerRecordExpandSchema,
  ) as unknown as typeof PointerRecordExpandSchema,
  hostname: PointerRecordSchema.shape.hostname.optional(),
  page: PaginationSchema.shape.page,
  per_page: PaginationSchema.shape.per_page,
});

export type ListPointerRecordsInput = z.infer<
  typeof ListPointerRecordsInputSchema
>;

export const ListPointerRecordsOutputSchema = z.object({
  records: z.array(GetPointerRecordOutputSchema.shape.record),
  meta: z.object({
    pagination: PaginationSchema,
  }),
});

export type ListPointerRecordsOutput = z.infer<
  typeof ListPointerRecordsOutputSchema
>;

export const UpsertPointerRecordInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  ip: z.union([z.ipv4(), z.ipv6()]),
  hostname: PointerRecordSchema.shape.hostname,
});

export type UpsertPointerRecordInput = z.infer<
  typeof UpsertPointerRecordInputSchema
>;

export const UpsertPointerRecordOutputSchema = z.object({
  record: GetPointerRecordOutputSchema.shape.record.omit({
    allocation: true,
  }),
});

export type UpsertPointerRecordOutput = z.infer<
  typeof UpsertPointerRecordOutputSchema
>;

export const DeletePointerRecordInputSchema = z.object({
  server_id: ServerSchema.shape.id,
  id: PointerRecordSchema.shape.id,
});

export type DeletePointerRecordInput = z.infer<
  typeof DeletePointerRecordInputSchema
>;

export const DeletePointerRecordOutputSchema = z.void();

export type DeletePointerRecordOutput = z.infer<
  typeof DeletePointerRecordOutputSchema
>;
