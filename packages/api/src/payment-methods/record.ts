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

import { and, eq, isNull, ne } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import { paymentMethods } from "@virtbase/db/schema";
import type { PaymentMethodSummary } from "./list";
import { paymentMethodSummaryColumns } from "./list";

type Database = typeof database;

/**
 * What a provider hands back once a customer has saved a credential.
 *
 * Display material and a token, and nothing in between. There is no field here
 * for a pan or a cvc and there must never be one: brand and last four digits
 * are what a dunning email needs to name the card, and they are also the most
 * this application can hold without leaving PCI SAQ-A for SAQ-D.
 */
export interface RecordPaymentMethodInput {
  db: Database;
  userId: string;
  /** Integration id of the provider holding the credential: `stripe`. */
  provider: string;
  /** The provider's own identifier, e.g. a Stripe PaymentMethod id. */
  externalId: string;
  /** The provider's label for the instrument: `card`, `sepa_debit`. */
  type: string;
  brand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
}

/**
 * The same credential is already on file for a different customer.
 *
 * `(provider, external_id)` is unique across the whole table, so an upsert that
 * did not care whose row it hit could move a saved card from one account to
 * another. It should be unreachable - a provider credential belongs to one
 * customer there too - so it is loud rather than silently corrective.
 */
export class PaymentMethodOwnershipConflictError extends Error {
  constructor(readonly provider: string) {
    super(
      `A ${provider} payment method is already recorded against a different customer.`,
    );
    this.name = "PaymentMethodOwnershipConflictError";
  }
}

/**
 * Writes down a credential the provider has just saved for a customer.
 *
 * Upserts on `(provider, external_id)`: re-attaching a card a customer removed
 * last year has to find its old row rather than mint a second one, or "which of
 * these two identical cards is the default" becomes a question with an answer.
 *
 * **The first live credential becomes the default.** A customer who has just
 * added their only card and is then told renewals have no payment method has
 * been asked to do the same thing twice. Later ones do not displace it -
 * changing where the money comes from is an explicit act, not a side effect of
 * saving a second card.
 *
 * `is_default` is always written explicitly rather than left alone, because
 * this is also the path a detached row comes back on. Such a row can still
 * carry the flag it had when it was removed, and un-detaching it without
 * recomputing would put two live defaults on one customer - which the partial
 * unique index refuses, at the far end of a customer's "save card".
 *
 * Two concurrent first saves can both see no default and both claim it; that
 * index is what settles it, and the loser fails rather than producing a
 * customer whose renewals are non-deterministic.
 */
export const recordPaymentMethod = async ({
  db,
  userId,
  provider,
  externalId,
  type,
  brand = null,
  last4 = null,
  expMonth = null,
  expYear = null,
}: RecordPaymentMethodInput): Promise<PaymentMethodSummary> =>
  db.transaction(
    async (tx) => {
      const existing = await tx
        .select({ id: paymentMethods.id, userId: paymentMethods.userId })
        .from(paymentMethods)
        .where(
          and(
            eq(paymentMethods.provider, provider),
            eq(paymentMethods.externalId, externalId),
          ),
        )
        .limit(1)
        .then(([row]) => row);

      if (existing && existing.userId !== userId) {
        throw new PaymentMethodOwnershipConflictError(provider);
      }

      // Whether this customer has a live default that is not this very row.
      // Excluding the row itself is what keeps a re-save of the current
      // default from demoting it.
      const otherDefault = await tx
        .select({ id: paymentMethods.id })
        .from(paymentMethods)
        .where(
          and(
            eq(paymentMethods.userId, userId),
            eq(paymentMethods.isDefault, true),
            isNull(paymentMethods.detachedAt),
            existing ? ne(paymentMethods.id, existing.id) : undefined,
          ),
        )
        .limit(1)
        .then(([row]) => row);

      const isDefault = !otherDefault;

      const values = {
        type,
        brand,
        last4,
        expMonth,
        expYear,
        isDefault,
        // The provider has just handed us a working credential, so whatever it
        // said last time it died no longer holds. Left in place, dunning would
        // keep skipping a card that is now fine.
        invalidAt: null,
        invalidReason: null,
        detachedAt: null,
      };

      const recorded = await tx
        .insert(paymentMethods)
        .values({ userId, provider, externalId, ...values })
        .onConflictDoUpdate({
          target: [paymentMethods.provider, paymentMethods.externalId],
          set: values,
          // [!] Authorization: `user_id` is never part of the update, and the
          // update refuses to touch another customer's row even if one
          // appeared between the read above and here.
          setWhere: eq(paymentMethods.userId, userId),
        })
        .returning(paymentMethodSummaryColumns)
        .then(([row]) => row);

      if (!recorded) {
        throw new PaymentMethodOwnershipConflictError(provider);
      }

      return recorded;
    },
    { accessMode: "read write", isolationLevel: "read committed" },
  );
