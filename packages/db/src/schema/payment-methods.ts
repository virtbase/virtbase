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

/**
 * A pointer to a credential the provider holds, never the credential itself.
 *
 * Auto-renewal has to charge someone who last visited eleven months ago, and
 * the only durable form of that is the provider's own token. Everything else
 * in this table is display material handed back alongside it, kept so a
 * dunning email can name the card the customer will recognise. No column here
 * can be used to take money, and all of them are safe to log — which is the
 * point: a pan or an IBAN would pull the whole application into PCI scope for
 * the sake of printing four digits.
 */
export const paymentMethods = d.snakeCase.table(
  "payment_methods",
  {
    id: d
      .text()
      .primaryKey()
      .$default(() => createId({ prefix: "pm_" })),
    userId: d
      .text()
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** Integration id of the provider holding the credential: `stripe`. */
    provider: d.text().notNull(),
    /** The provider's own identifier, e.g. a Stripe PaymentMethod id. */
    externalId: d.text().notNull(),
    /** The provider's label for the instrument: `card`, `sepa_debit`. */
    type: d.text().notNull(),
    brand: d.text(),
    /** Text, not an integer: the leading zeros in `0042` are part of it. */
    last4: d.text(),
    expMonth: d.smallint(),
    expYear: d.smallint(),
    /**
     * The credential a renewal charges when the subscription names none.
     *
     * A flag rather than a column on `users`, so detaching the card is one
     * write and does not have to remember to repoint a foreign key.
     */
    isDefault: d.boolean().notNull().default(false),
    /**
     * When the provider told us the credential is dead — expired, revoked,
     * mandate cancelled.
     *
     * Without it dunning can only say "payment failed", which reads as our
     * fault and gets ignored; with it the first email says "your card
     * expired", which is the wording that gets a customer to act before the
     * server is suspended. It also keeps the collector from spending the
     * dunning ladder on a credential that cannot succeed however many times it
     * is presented.
     */
    invalidAt: d.timestamp({ withTimezone: true, mode: "date" }),
    /** The provider's own reason, stored unclassified. */
    invalidReason: d.text(),
    createdAt: d
      .timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    /**
     * Soft delete, because subscriptions and payments point at this row.
     *
     * A customer removing a card must not take the record of what was charged
     * with it — a receipt that cannot say which card paid is not a receipt.
     */
    detachedAt: d.timestamp({ withTimezone: true, mode: "date" }),
  },
  (t) => [
    // A provider's id for a credential is unique within that provider.
    // Re-attaching the same card has to find this row rather than mint a
    // second one, or "which of these two identical cards is the default"
    // becomes a question with an answer.
    d.unique().on(t.provider, t.externalId),
    // The target of the composite foreign key on `subscriptions`. Redundant
    // as a uniqueness claim — `id` is already the primary key — and present
    // only so a subscription can be made to reference a credential *and* its
    // owner in one constraint, which is what stops one customer's
    // subscription naming another customer's card.
    d.unique().on(t.id, t.userId),
    // At most one default per customer, enforced by the database rather than
    // by whoever remembers to clear the previous flag first. Two defaults make
    // "charge the customer's default" a non-deterministic query, which surfaces
    // as a renewal billed to the card they thought they had replaced.
    d
      .uniqueIndex("payment_methods_user_id_default_index")
      .on(t.userId)
      .where(sql`${t.isDefault} AND ${t.detachedAt} IS NULL`),
    // The billing page and the collector both ask for a customer's live
    // credentials. Partial on the same predicate, so someone who has churned
    // through twenty cards does not drag nineteen dead rows through it.
    d.index().on(t.userId).where(sql`${t.detachedAt} IS NULL`),
  ],
);

export type PaymentMethod = typeof paymentMethods.$inferSelect;
