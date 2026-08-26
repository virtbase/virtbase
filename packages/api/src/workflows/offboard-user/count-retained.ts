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

import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { invoices, orders, payments } from "@virtbase/db/schema";

type CountRetainedStepParams = {
  userId: string;
};

/**
 * How much of the account is being kept rather than erased.
 *
 * Read before the anonymisation so the audit entry can say what survived and
 * under which basis, without the log itself having to join back to rows that
 * are about to lose the person they belonged to.
 */
export async function countRetainedStep({ userId }: CountRetainedStepParams) {
  "use step";

  return db.transaction(
    async (tx) => {
      const [invoiceCount, orderCount, paymentCount] = await Promise.all([
        tx.$count(invoices, eq(invoices.userId, userId)),
        tx.$count(orders, eq(orders.userId, userId)),
        tx.$count(payments, eq(payments.userId, userId)),
      ]);

      return {
        invoices: invoiceCount,
        orders: orderCount,
        payments: paymentCount,
      };
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );
}
