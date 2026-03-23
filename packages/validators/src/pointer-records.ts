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

export const PointerRecordSchema = z.object({
  id: z.string().regex(/^ipptr_[A-Z0-9]{25}$/),
  subnet_allocation_id: z.string().regex(/^ipalloc_[A-Z0-9]{25}$/),
  ip: z.union([z.ipv4(), z.ipv6()]),
  hostname: z.string(),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type PointerRecord = z.infer<typeof PointerRecordSchema>;
