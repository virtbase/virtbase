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
import { ServerSchema } from "./server/shared";
import { SubnetSchema } from "./subnets";
import { EXAMPLE_DATE, ObjectTimestampSchema, RFC3339LINK } from "./timestamps";

export const SubnetAllocationSchema = z.object({
  id: z
    .string()
    .regex(/^ipalloc_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the subnet allocation.",
      examples: ["ipalloc_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  subnet_id: SubnetSchema.shape.id,
  server_id: ServerSchema.shape.id.nullable(),
  description: z
    .string()
    .nullable()
    .meta({
      description: "The description of the subnet allocation.",
      examples: ["System-allocated allocation"],
    }),
  allocated_at: z.date().meta({
    description: `The timestamp when the subnet allocation was allocated ${RFC3339LINK}.`,
    examples: [EXAMPLE_DATE],
  }),
  deallocated_at: z
    .date()
    .nullable()
    .meta({
      description: `The timestamp when the subnet allocation was deallocated ${RFC3339LINK}.`,
      examples: [EXAMPLE_DATE, null],
    }),
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type SubnetAllocation = z.infer<typeof SubnetAllocationSchema>;
