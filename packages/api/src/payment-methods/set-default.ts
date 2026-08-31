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

type Database = typeof database;

/**
 * Rolls the transaction back when the id names nothing the caller owns.
 *
 * Private and never thrown past `setDefaultPaymentMethod`. It exists because
 * the clear has to happen first (see below) and must not survive a miss: an
 * unknown id would otherwise leave the customer with no default at all, which
 * is a renewal that stops happening in exchange for a typo.
 */
class PaymentMethodNotFoundError extends Error {}

/**
 * Points the customer's renewals at one of their own saved credentials.
 *
 * Returns `null` when the id names nothing they own - a caller turns that into
 * a 404 rather than distinguishing "does not exist" from "belongs to someone
 * else", which would answer whether an id is real.
 *
 * **Ownership is a `WHERE` clause, not a check.** Both statements carry
 * `user_id = $userId`, so there is no window between reading a row and writing
 * it, and no version of this that trusts an id because a prior `SELECT` looked
 * right. An id off the wire is a filter; it never selects the row on its own.
 *
 * **Order is forced by the index.** `payment_methods_user_id_default_index` is
 * unique on `(user_id) WHERE is_default AND detached_at IS NULL`, and Postgres
 * checks it per statement, not at commit. Setting the new default before
 * clearing the old one would violate it in the middle of the transaction even
 * though the end state is legal. So: clear, then set, both inside one
 * transaction so nothing can observe a customer with no default and nothing
 * can leave them that way.
 */
export const setDefaultPaymentMethod = async ({
  db,
  userId,
  paymentMethodId,
}: {
  db: Database;
  userId: string;
  paymentMethodId: string;
}): Promise<PaymentMethodSummary | null> => {
  try {
    return await db.transaction(
      async (tx) => {
        // 1. Clear the existing default. Scoped to this customer, so it can
        //    never touch anybody else's row.
        await tx
          .update(paymentMethods)
          .set({ isDefault: false })
          .where(
            and(
              // [!] Authorization: only ever the caller's own credentials
              eq(paymentMethods.userId, userId),
              eq(paymentMethods.isDefault, true),
              isNull(paymentMethods.detachedAt),
            ),
          );

        // 2. Promote the requested one. A detached credential cannot be made
        //    the default: it is gone at the provider and would charge nothing.
        const updated = await tx
          .update(paymentMethods)
          .set({ isDefault: true })
          .where(
            and(
              eq(paymentMethods.id, paymentMethodId),
              // [!] Authorization: the id is a filter, never a selector
              eq(paymentMethods.userId, userId),
              isNull(paymentMethods.detachedAt),
            ),
          )
          .returning(paymentMethodSummaryColumns)
          .then(([row]) => row);

        if (!updated) throw new PaymentMethodNotFoundError();

        return updated;
      },
      { accessMode: "read write", isolationLevel: "read committed" },
    );
  } catch (error) {
    // The throw above is what rolls step 1 back; catching it here is what
    // stops that rollback from reading as a server error to the caller.
    if (error instanceof PaymentMethodNotFoundError) return null;
    throw error;
  }
};
