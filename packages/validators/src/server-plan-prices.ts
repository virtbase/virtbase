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
import { DiscountSchema } from "./discounts";
import { ServerPlanSchema } from "./server-plan";
import { ObjectTimestampSchema } from "./timestamps";

export const ServerPlanPriceSchema = z.object({
  id: z
    .string()
    .regex(/^price_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the server plan price.",
      examples: ["price_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  server_plan_id: ServerPlanSchema.shape.id,
  purchase_price: z.int().meta({
    description: "The price of the server plan for a new purchase in cents.",
    examples: [2999, 5999],
  }),
  renewal_price: z.int().meta({
    description: "The price of the server plan for a renewal in cents.",
    examples: [3499, 6999],
  }),
  purchase_discount_id: DiscountSchema.shape.id.nullable().meta({
    description:
      "The id of the discount that was applied to `purchase_price`, if any.",
  }),
  renewal_discount_id: DiscountSchema.shape.id.nullable().meta({
    description:
      "The id of the discount that was applied to `renewal_price`, if any.",
  }),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type ServerPlanPrice = z.infer<typeof ServerPlanPriceSchema>;
