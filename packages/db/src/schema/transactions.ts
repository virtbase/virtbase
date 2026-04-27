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
import { index, pgEnum, pgTable, unique } from "drizzle-orm/pg-core";
import { createId } from "../utils/create-id";
import { users } from "./auth";

export const paymentMethodsEnum = pgEnum("payment_methods", [
  "stripe",
  "anonpay",
]);

export const transactions = pgTable(
  "transactions",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "txn_" })),
    userId: t
      .text()
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    paymentMethod: paymentMethodsEnum().notNull(),
    externalId: t.text().notNull(),
    amount: t.integer().notNull(),
    currency: t.text().notNull(),
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
    index().on(t.userId),
    // External ID is unique per payment method
    unique().on(t.paymentMethod, t.externalId),
  ],
);

export type DatabaseTransaction = typeof transactions.$inferSelect;
