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
import { createId } from "../utils";
import { users } from "./auth";

export const invoices = pgTable(
  "invoices",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "inv_" })),
    userId: t
      .text()
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The UUID of the Lexware Office invoice.
     */
    lexwareInvoiceId: t.uuid().notNull().unique(),
    /**
     * The number of the invoice.
     */
    number: t.text().notNull(),
    /**
     * The total amount of the invoice in cents including tax.
     */
    total: t.integer().notNull(),
    /**
     * The tax amount of the invoice in cents.
     */
    taxAmount: t.integer().notNull(),
    /**
     * Whether the reverse charge applies to the invoice.
     */
    reverseCharge: t.boolean().notNull(),
    /**
     * The timestamp when the invoice was cancelled.
     */
    cancelledAt: t.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the invoice was fully paid.
     */
    paidAt: t.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the invoice was delivered to the customer.
     */
    sentAt: t.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the invoice was created.
     */
    createdAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    /**
     * The timestamp when the invoice was last updated.
     */
    updatedAt: t
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  }),
  (t) => [index().on(t.userId), index().on(t.lexwareInvoiceId)],
);
