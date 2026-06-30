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
import { createId } from "../utils";
import { users } from "./auth";

export const invoices = d.snakeCase.table(
  "invoices",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "inv_" })),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The UUID of the Lexware Office invoice.
     */
    lexwareInvoiceId: d.uuid().notNull().unique(),
    /**
     * The number of the invoice.
     */
    number: d.text().notNull(),
    /**
     * The total amount of the invoice in cents including tax.
     */
    total: d.integer().notNull(),
    /**
     * The tax amount of the invoice in cents.
     */
    taxAmount: d.integer().notNull(),
    /**
     * Whether the reverse charge applies to the invoice.
     */
    reverseCharge: d.boolean().notNull(),
    /**
     * The timestamp when the invoice was cancelled.
     */
    cancelledAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the invoice was fully paid.
     */
    paidAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the invoice was delivered to the customer.
     */
    sentAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /**
     * The timestamp when the invoice was created.
     */
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    /**
     * The timestamp when the invoice was last updated.
     */
    updatedAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [d.index().on(t.userId), d.index().on(t.lexwareInvoiceId)],
);
