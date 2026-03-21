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

export const ProxmoxNodeGroupSchema = z.object({
  id: z.string().regex(/^png_[A-Z0-9]{25}$/),
  name: z.string().min(1).max(255),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type ProxmoxNodeGroup = z.infer<typeof ProxmoxNodeGroupSchema>;

export const CreateProxmoxNodeGroupInputSchema = ProxmoxNodeGroupSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
