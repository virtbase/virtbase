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
import { serverPlanPrices } from "./server-plan-prices";
import { serverPlans } from "./server-plans";
import { servers } from "./servers";

export const orderTypeEnum = d.pgEnum("order_types", [
  "new_server",
  "extend_server",
  "upgrade_server",
]);

/**
 * `draft → awaiting_payment → paid → fulfilling → fulfilled`, with `failed`,
 * `cancelled` and `refunded` as terminal branches.
 *
 * Transitions are recorded in `orderTransitions` rather than inferred from
 * timestamps, so "what happened to this order" has one answer.
 */
export const orderStatusEnum = d.pgEnum("order_statuses", [
  "draft",
  "awaiting_payment",
  "paid",
  "fulfilling",
  "fulfilled",
  "failed",
  "cancelled",
  "refunded",
]);

/**
 * What a customer bought.
 *
 * This replaces the configuration snapshot that used to travel encrypted and
 * chunked through Stripe PaymentIntent metadata (finding F9). The order is the
 * record; the payment intent only points at it.
 */
export const orders = d.snakeCase.table(
  "orders",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "ord_" })),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: orderTypeEnum().notNull(),
    status: orderStatusEnum().notNull().default("draft"),

    /** Total charged to the customer, in the smallest currency unit. */
    totalAmount: d.integer().notNull(),
    currency: d.text().notNull().default("EUR"),

    /**
     * The order configuration, minus anything secret.
     *
     * Stored as readable JSON on purpose: an order nobody can inspect is the
     * problem this table exists to fix. The one genuine secret it used to
     * carry — a customer-chosen root password — lives encrypted in
     * `rootPasswordCiphertext` instead.
     */
    configuration: d.jsonb().notNull(),

    /**
     * AES-256-GCM ciphertext of the initial root password, when the customer
     * set one. Cleared once the server has been provisioned, because there is
     * no reason to keep it afterwards.
     */
    rootPasswordCiphertext: d.text(),

    /**
     * Where the customer is billed, once known.
     *
     * Not available at checkout: Stripe collects it during payment and it is
     * read off the charge afterwards, so it is recorded when the payment
     * settles. Tax treatment depends on it.
     */
    billingAddress: d.jsonb(),

    /** The server being extended or upgraded; `null` for a new server. */
    serverId: d.text().references(() => servers.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),

    /** Why the order failed, when it did. */
    failureReason: d.text(),

    paidAt: d.timestamp({ withTimezone: true, mode: "date" }),
    fulfilledAt: d.timestamp({ withTimezone: true, mode: "date" }),
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
    d.index().on(t.status),
    d.index().on(t.createdAt),
  ],
);

/**
 * The priced lines of an order.
 *
 * Separate from `configuration` because these are what an invoice is built
 * from, and because they snapshot the plan name and price at order time —
 * renaming a plan later must not rewrite what a customer was billed for.
 */
export const orderItems = d.snakeCase.table(
  "order_items",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "oi_" })),
    orderId: d
      .text()
      .notNull()
      .references(() => orders.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    serverPlanId: d.text().references(() => serverPlans.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    serverPlanPriceId: d.text().references(() => serverPlanPrices.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** Plan name as it read at order time. */
    name: d.text().notNull(),
    description: d.text(),
    quantity: d.integer().notNull().default(1),
    /** Gross unit price in the smallest currency unit. */
    unitAmount: d.integer().notNull(),
    /**
     * Percentage, e.g. `19` for German standard VAT.
     *
     * Null until the billing country is known — which is not at order time.
     * Distinguishing "not yet known" from a genuine zero rate matters, because
     * zero is a legitimate rate.
     */
    taxRatePercentage: d.integer(),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [d.index().on(t.orderId)],
);

/**
 * Append-only record of every status change.
 *
 * Answers "when did this order become paid, and what moved it" without relying
 * on a column per state.
 */
export const orderTransitions = d.snakeCase.table(
  "order_transitions",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "otr_" })),
    orderId: d
      .text()
      .notNull()
      .references(() => orders.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** `null` for the transition that created the order. */
    fromStatus: orderStatusEnum(),
    toStatus: orderStatusEnum().notNull(),
    /** Who or what caused it: `system`, `provider:stripe`, `admin:<user id>`. */
    actor: d.text().notNull().default("system"),
    reason: d.text(),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [d.index().on(t.orderId)],
);

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderTransition = typeof orderTransitions.$inferSelect;
export type OrderStatus = Order["status"];
export type OrderType = Order["type"];
