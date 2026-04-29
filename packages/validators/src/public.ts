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
import { ServerPlanSchema } from "./server-plan";

export const GetOfferListOutputSchema = z.array(
  z.object({
    id: ServerPlanSchema.shape.id,
    name: ServerPlanSchema.shape.name,
    cores: ServerPlanSchema.shape.cores,
    memory: ServerPlanSchema.shape.memory,
    storage: ServerPlanSchema.shape.storage,
    netrate: ServerPlanSchema.shape.netrate,
    price: ServerPlanSchema.shape.price,
    is_available: z
      .boolean()
      .describe("Whether the offer is currently available."),
  }),
);

export type GetOfferListOutput = z.infer<typeof GetOfferListOutputSchema>;
