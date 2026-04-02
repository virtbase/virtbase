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

export const DatacenterSchema = z.object({
  id: z
    .string()
    .regex(/^dc_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the datacenter.",
      examples: ["dc_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  name: z
    .string()
    .min(1)
    .max(255)
    .meta({
      description: "The official name of the datacenter.",
      examples: ["Skylink Data Center"],
    }),
  country: z
    .string()
    .min(2)
    .max(2)
    .uppercase()
    .meta({
      description: "The two-letter ISO 3166-1 alpha-2 code of the country.",
      examples: ["NL"],
    }),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type Datacenter = z.infer<typeof DatacenterSchema>;

export const CreateDatacenterInputSchema = DatacenterSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type CreateDatacenterInput = z.infer<typeof CreateDatacenterInputSchema>;
