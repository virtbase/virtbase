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
import { DiscountSchema } from "../discounts";
import { ServerPlanSchema } from "../server-plan";
import { ServerSchema } from "./shared";

export const GetServerPlanInputSchema = z.object({
  server_id: ServerSchema.shape.id,
});

export type GetServerPlanInput = z.infer<typeof GetServerPlanInputSchema>;

const PlanDiscountSchema = DiscountSchema.pick({
  id: true,
  name: true,
  type: true,
  amount: true,
}).nullable();

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
      /**
       * Resulting purchase price after the best active discount has been
       * applied. Equals `price` if no discount applies.
       */
      purchase_price: z.int(),
      /**
       * Renewal price the customer will be charged on their next renewal
       * cycle. For the current plan this is the price locked in on the
       * server's `server_plan_prices` row (so any custom/expired discount
       * is preserved). For other plans it is the freshly-evaluated catalog
       * renewal price (the price an upgrade would lock in going forward).
       */
      renewal_price: z.int(),
      /**
       * Pro-rata charge to upgrade to this plan today, in cents. `null`
       * for the customer's current plan (no upgrade applies). For other
       * plans it is the difference between this plan's renewal price and
       * the customer's locked renewal price, scaled by the fraction of
       * the current term still remaining, floored at the Stripe EUR
       * minimum charge so the order can still be processed.
       */
      upgrade_price: z.int().nullable(),
      purchase_discount: PlanDiscountSchema,
      renewal_discount: PlanDiscountSchema,
    }),
  ),
});

export type GetServerPlanOutput = z.infer<typeof GetServerPlanOutputSchema>;
