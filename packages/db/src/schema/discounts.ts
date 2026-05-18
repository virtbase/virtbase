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
import { check, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";

export const discountTypesEnum = pgEnum("discount_types", [
  "PERCENTAGE",
  "FIXED",
]);

export const discountAppliesToEnum = pgEnum("discount_applies_to", [
  "PURCHASE",
  "RENEWAL",
  "BOTH",
]);

export const discounts = pgTable(
  "discounts",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "dsc_" })),
    /**
     * The name of the discount.
     *
     * @example "Summer Sale"
     */
    name: t.text().notNull(),
    /**
     * The type of the discount:
     * - `PERCENTAGE`: A percentage discount; see `amount` for the unit.
     * - `FIXED`: A fixed discount in cents; see `amount` for the unit.
     */
    type: discountTypesEnum().notNull(),
    /**
     * The amount of the discount. Interpretation depends on `type`:
     * - When `type = PERCENTAGE`: integer percent between 1 and 100
     *   (e.g. `10` means 10 % off).
     * - When `type = FIXED`: amount in cents to subtract from the price
     *   (e.g. `1000` means 10 €).
     */
    amount: t.integer().notNull(),
    /**
     * Which side of the price the discount applies to:
     * - `PURCHASE`: Only the first (new server) purchase.
     * - `RENEWAL`: Only renewals (extensions of an existing server).
     * - `BOTH`: The initial purchase and every renewal.
     */
    appliesTo: discountAppliesToEnum().notNull(),
    /**
     * Whether the discount is currently active. Inactive discounts are
     * ignored even if their date window is current.
     */
    active: t.boolean().notNull().default(true),
    /**
     * The timestamp when the discount becomes active. `NULL` means the
     * discount is already active (no lower bound).
     */
    startsAt: t.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the discount stops being active. `NULL` means the
     * discount has no expiration (no upper bound).
     */
    endsAt: t.timestamp({ withTimezone: true, mode: "date" }),
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
  (t) => [
    check(
      "discounts_amount_range",
      sql`(${t.type} = 'PERCENTAGE' AND ${t.amount} BETWEEN 1 AND 100) OR (${t.type} = 'FIXED' AND ${t.amount} > 0)`,
    ),
  ],
);

export type DatabaseDiscount = typeof discounts.$inferSelect;
