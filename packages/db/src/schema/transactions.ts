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
import { users } from "./auth";

export const paymentMethodsEnum = d.pgEnum("payment_methods", [
  "stripe",
  "anonpay",
]);

export const transactions = d.snakeCase.table(
  "transactions",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "txn_" })),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    paymentMethod: paymentMethodsEnum().notNull(),
    externalId: d.text().notNull(),
    amount: d.integer().notNull(),
    currency: d.text().notNull(),
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
  (t) => [
    d.index().on(t.userId),
    // External ID is unique per payment method
    d.unique().on(t.paymentMethod, t.externalId),
  ],
);

export type DatabaseTransaction = typeof transactions.$inferSelect;
