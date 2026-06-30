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

import { sql } from "drizzle-orm";
import * as d from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";
import { discounts } from "./discounts";
import { serverPlans } from "./server-plans";

export const serverPlanPrices = d.snakeCase.table(
  "server_plan_prices",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "price_" })),
    /**
     * The server plan this price is for.
     */
    serverPlanId: d
      .text()
      .notNull()
      .references(() => serverPlans.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The price of the server plan for a new purchase in cents.
     */
    purchasePrice: d.integer().notNull(),
    /**
     * The price of the server plan for a renewal in cents.
     */
    renewalPrice: d.integer().notNull(),
    /**
     * The discount applied to the purchase price if any.
     */
    purchaseDiscountId: d.text().references(() => discounts.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * The discount applied to the renewal price if any.
     */
    renewalDiscountId: d.text().references(() => discounts.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [d.index().on(t.serverPlanId)],
);

export type DatabaseServerPlanPrice = typeof serverPlanPrices.$inferSelect;
