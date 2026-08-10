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
import { orders } from "./orders";

export const paymentStatusEnum = d.pgEnum("payment_statuses", [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
]);

/**
 * An attempt to take money for an order.
 *
 * Replaces `transactions`, which recorded a receipt with no status, no order
 * link and nowhere to put a refund (finding F10). More than one payment can
 * belong to an order — a failed card followed by a successful one.
 */
export const payments = d.snakeCase.table(
  "payments",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "pay_" })),
    orderId: d.text().references(() => orders.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** Integration id of the provider: `stripe`, `anonpay`, `credit`. */
    provider: d.text().notNull(),
    /** The provider's own identifier, e.g. a Stripe PaymentIntent id. */
    externalId: d.text().notNull(),
    status: paymentStatusEnum().notNull().default("pending"),

    /** What was asked for, in the smallest currency unit. */
    amount: d.integer().notNull(),
    /** What was actually taken. Below `amount` for a partial capture. */
    capturedAmount: d.integer().notNull().default(0),
    /** What has been given back. Never more than `capturedAmount`. */
    refundedAmount: d.integer().notNull().default(0),
    currency: d.text().notNull().default("EUR"),

    /** The provider's label for how it was paid: `card`, `sepa_debit`, `xmr`. */
    method: d.text(),
    failureReason: d.text(),

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
    d.index().on(t.orderId),
    d.index().on(t.userId),
    // A provider's id for a payment is unique within that provider.
    d.unique().on(t.provider, t.externalId),
  ],
);

/**
 * Every provider event that has been applied, and only once.
 *
 * Payment providers retry webhooks and deliver them out of order. Recording
 * `(provider, eventId)` before acting is what stops a duplicate delivery
 * provisioning a second server — which the two hand-written webhook handlers
 * this replaces had no protection against at all.
 */
export const paymentEvents = d.snakeCase.table(
  "payment_events",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "pev_" })),
    provider: d.text().notNull(),
    /** The provider's event id, not the payment id. */
    eventId: d.text().notNull(),
    paymentId: d.text().references(() => payments.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    orderId: d.text().references(() => orders.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** Normalised type: `payment.succeeded`, `payment.failed`, … */
    type: d.text().notNull(),
    /** When the provider says it happened, as opposed to when we saw it. */
    occurredAt: d.timestamp({ withTimezone: true, mode: "date" }),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [d.unique().on(t.provider, t.eventId), d.index().on(t.orderId)],
);

export type Payment = typeof payments.$inferSelect;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type PaymentStatus = Payment["status"];
