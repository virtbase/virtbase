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

import { and, eq, isNull } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import { paymentMethods } from "@virtbase/db/schema";
import type { PaymentMethodSummary } from "./list";
import { paymentMethodSummaryColumns } from "./list";
import { requirePaymentCapability } from "./provider";

type Database = typeof database;

/**
 * Removes a saved credential: detached at the provider, then soft-deleted here.
 *
 * Returns `null` when the id names nothing the caller owns. Throws when the
 * provider refuses or is unreachable, and in that case **nothing local
 * changes**.
 *
 * **The order is the whole point.** Detaching is the only thing that
 * guarantees the credential can never be charged again; dropping our own row
 * merely stops us from choosing it. Soft-deleting first and detaching second
 * would mean a provider failure leaves a row the customer can no longer see
 * over a credential the provider will still honour - a card they believe they
 * removed, invisible to them and to us, and still chargeable. Doing it the
 * other way round, a failure leaves the row exactly where it was: visible,
 * still listed, and the customer can press remove again. A retryable
 * inconvenience beats an unretryable one nobody can see.
 *
 * The cost of this order is the opposite window: detached at Stripe, still a
 * row here, if the update fails after the detach. That row charges nothing -
 * the credential behind it is gone - and the next attempt settles it.
 *
 * **A removed default is not replaced.** Promoting the customer's next card
 * would silently move their renewals onto an instrument they never chose for
 * it, which they find out about on a statement. They are left with no default
 * instead, and the UI asks.
 */
export const removePaymentMethod = async ({
  db,
  userId,
  paymentMethodId,
}: {
  db: Database;
  userId: string;
  paymentMethodId: string;
}): Promise<PaymentMethodSummary | null> => {
  // The provider and its own id for the credential are the two things the
  // detach needs and the only reason this reads the row at all. Scoped by
  // `user_id`, so an id belonging to somebody else finds nothing.
  const existing = await db.transaction(
    async (tx) =>
      tx
        .select({
          id: paymentMethods.id,
          provider: paymentMethods.provider,
          externalId: paymentMethods.externalId,
        })
        .from(paymentMethods)
        .where(
          and(
            eq(paymentMethods.id, paymentMethodId),
            // [!] Authorization: the id is a filter, never a selector
            eq(paymentMethods.userId, userId),
            isNull(paymentMethods.detachedAt),
          ),
        )
        .limit(1)
        .then(([row]) => row),
    { accessMode: "read only", isolationLevel: "read committed" },
  );

  if (!existing) return null;

  // Throws if the provider is disabled or cannot detach at all, before
  // anything local has been touched.
  const detachPaymentMethod = await requirePaymentCapability(
    existing.provider,
    "detachPaymentMethod",
  );

  await detachPaymentMethod(existing.externalId);

  return db.transaction(
    async (tx) =>
      tx
        .update(paymentMethods)
        .set({
          detachedAt: new Date(),
          // Cleared alongside the soft delete. The unique index ignores
          // detached rows, so a stale `is_default` is harmless until the day
          // `recordPaymentMethod` re-attaches this same card - at which point
          // the row would come back already flagged and collide with whatever
          // became the default in between.
          isDefault: false,
        })
        .where(
          and(
            eq(paymentMethods.id, existing.id),
            // [!] Authorization: re-asserted rather than inherited from the
            // read above, which is a separate transaction ago.
            eq(paymentMethods.userId, userId),
            isNull(paymentMethods.detachedAt),
          ),
        )
        .returning(paymentMethodSummaryColumns)
        .then(([row]) => row ?? null),
    { accessMode: "read write", isolationLevel: "read committed" },
  );
};
