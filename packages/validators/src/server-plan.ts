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

export const ServerPlanSchema = z.object({
  id: z
    .string()
    .regex(/^pck_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the server plan.",
      examples: ["pck_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  // proxmoxNodeGroupId placeholder
  name: z
    .string()
    .min(1)
    .max(255)
    .meta({
      description: "Displayable name of the server plan.",
      examples: ["Plan 1"],
    }),
  cores: z
    .number()
    .int()
    .positive()
    .meta({
      description: "The number of guaranteed vCores of the server plan.",
      examples: [1, 2, 4, 8],
    }),
  memory: z
    .number()
    .int()
    .positive()
    .meta({
      description: "The guaranteed memory of the server plan in MiB.",
      examples: [1024, 2048, 4096, 8192],
    }),
  storage: z
    .number()
    .int()
    .positive()
    .meta({
      description: "The guaranteed storage of the server plan in GiB.",
      examples: [100, 200, 400, 800],
    }),
  netrate: z
    .number()
    .int()
    .positive()
    .nullable()
    .meta({
      description:
        "The maximum network bandwidth limit of the server plan in MB/s.",
      examples: [1000, 2000, 4000, 8000],
      internal: true,
    }),
  price: z
    .number()
    .int()
    .positive()
    .meta({
      description: "The monthly price of the server plan in cents.",
      examples: [1000, 2000, 4000, 8000],
    }),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});
