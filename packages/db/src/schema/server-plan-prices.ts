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
import { index, pgTable } from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";
import { discounts } from "./discounts";
import { serverPlans } from "./server-plans";

export const serverPlanPrices = pgTable(
  "server_plan_prices",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "price_" })),
    /**
     * The server plan this price is for.
     */
    serverPlanId: t
      .text()
      .notNull()
      .references(() => serverPlans.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The price of the server plan for a new purchase in cents.
     */
    purchasePrice: t.integer().notNull(),
    /**
     * The price of the server plan for a renewal in cents.
     */
    renewalPrice: t.integer().notNull(),
    /**
     * The discount applied to the purchase price if any.
     */
    purchaseDiscountId: t.text().references(() => discounts.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * The discount applied to the renewal price if any.
     */
    renewalDiscountId: t.text().references(() => discounts.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  }),
  (t) => [index().on(t.serverPlanId)],
);

export type DatabaseServerPlanPrice = typeof serverPlanPrices.$inferSelect;
