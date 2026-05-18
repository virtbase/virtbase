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

export const DiscountTypeSchema = z
  .enum(["PERCENTAGE", "FIXED"])
  .describe(
    "Whether `amount` is interpreted as a percentage (1-100) or a fixed amount in cents.",
  );

export const DiscountAppliesToSchema = z
  .enum(["PURCHASE", "RENEWAL", "BOTH"])
  .describe(
    "Which side of the price the discount applies to: a new purchase, a renewal, or both.",
  );

export const DiscountSchema = z.object({
  id: z
    .string()
    .regex(/^dsc_[A-Z0-9]{25}$/)
    .meta({
      description: "Unique identifier of the discount.",
      examples: ["dsc_1KDR24RNF2WY69G0FG7YHDQ6T"],
    }),
  name: z
    .string()
    .min(1)
    .max(255)
    .meta({
      description: "Displayable name of the discount.",
      examples: ["Summer Sale"],
    }),
  type: DiscountTypeSchema,
  amount: z
    .int()
    .positive()
    .meta({
      description:
        "Amount of the discount. For PERCENTAGE: integer 1-100. For FIXED: cents to subtract from the price.",
      examples: [10, 1000],
    }),
  applies_to: DiscountAppliesToSchema,
  active: z.boolean().meta({
    description:
      "Whether the discount is currently active. Inactive discounts are never applied.",
  }),
  starts_at: z.date().nullable().meta({
    description:
      "The timestamp when the discount becomes active. `null` means no lower bound.",
  }),
  ends_at: z.date().nullable().meta({
    description:
      "The timestamp when the discount stops being active. `null` means no upper bound.",
  }),
  created_at: ObjectTimestampSchema.shape.created_at,
  updated_at: ObjectTimestampSchema.shape.updated_at,
});

export type Discount = z.infer<typeof DiscountSchema>;
