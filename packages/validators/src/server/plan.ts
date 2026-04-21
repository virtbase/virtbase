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
import { ServerPlanSchema } from "../server-plan";
import { ServerSchema } from "./shared";

export const GetServerPlanInputSchema = z.object({
  server_id: ServerSchema.shape.id,
});

export type GetServerPlanInput = z.infer<typeof GetServerPlanInputSchema>;

export const GetServerPlanOutputSchema = z.object({
  plans: z.array(
    ServerPlanSchema.pick({
      id: true,
      name: true,
      cores: true,
      memory: true,
      storage: true,
      netrate: true,
      price: true,
    }).extend({
      current: z.boolean(),
      available: z.boolean(),
    }),
  ),
});

export type GetServerPlanOutput = z.infer<typeof GetServerPlanOutputSchema>;
