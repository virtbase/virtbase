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

import { and, desc, eq, isNull } from "@virtbase/db";
import type { db as database } from "@virtbase/db/client";
import { paymentMethods } from "@virtbase/db/schema";

type Database = typeof database;

/**
 * A saved credential as a customer is allowed to see it.
 *
 * `provider` and `externalId` are deliberately absent, and every query in this
 * module is written to select columns rather than the row. `externalId` is the
 * token an off-session charge is made against: handing it to the browser turns
 * a read endpoint into half of a payment credential, and it would then be in
 * logs, in error reports and in anyone's devtools. `provider` is withheld for a
 * quieter reason - it is the name of an integration, and which processor sits
 * behind the checkout is not a customer's business.
 *
 * What is here is display material and nothing else: brand and last four
 * digits, never a pan, which is what keeps this application in SAQ-A.
 */
export interface PaymentMethodSummary {
  id: string;
  /** The provider's label for the instrument: `card`, `sepa_debit`. */
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  /** Set once the provider told us the credential is dead. */
  invalidAt: Date | null;
  invalidReason: string | null;
}

/**
 * The columns every query in this module returns. One object so that a column
 * added to the table cannot leak by being picked up somewhere a `select()` was
 * written without a projection.
 */
export const paymentMethodSummaryColumns = {
  id: paymentMethods.id,
  type: paymentMethods.type,
  brand: paymentMethods.brand,
  last4: paymentMethods.last4,
  expMonth: paymentMethods.expMonth,
  expYear: paymentMethods.expYear,
  isDefault: paymentMethods.isDefault,
  invalidAt: paymentMethods.invalidAt,
  invalidReason: paymentMethods.invalidReason,
} as const;

/**
 * A customer's live credentials, the default first and then newest first.
 *
 * Detached rows are excluded rather than deleted: a payment points at the row
 * that paid it, and a receipt that cannot name the card is not a receipt. The
 * predicate matches the partial index on `(user_id) WHERE detached_at IS NULL`,
 * so a customer who has churned through twenty cards does not drag the dead
 * ones through this.
 */
export const listPaymentMethods = async ({
  db,
  userId,
}: {
  db: Database;
  userId: string;
}): Promise<PaymentMethodSummary[]> =>
  db.transaction(
    async (tx) =>
      tx
        .select(paymentMethodSummaryColumns)
        .from(paymentMethods)
        .where(
          and(
            // [!] Authorization: only ever the caller's own credentials
            eq(paymentMethods.userId, userId),
            isNull(paymentMethods.detachedAt),
          ),
        )
        // `true` sorts after `false` ascending, so the default needs `desc` to
        // come first. Newest next, because the card a customer just added is
        // the one they are looking for.
        .orderBy(
          desc(paymentMethods.isDefault),
          desc(paymentMethods.createdAt),
        ),
    { accessMode: "read only", isolationLevel: "read committed" },
  );
