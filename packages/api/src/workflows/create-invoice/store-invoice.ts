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

import { eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { invoices, users } from "@virtbase/db/schema";
import { FatalError } from "workflow";
import { lexware } from "../../lexware";

type StoreInvoiceStepInput = {
  createdInvoiceId: string;
  stripeCustomerId: string;
};

export async function storeInvoiceStep({
  createdInvoiceId,
  stripeCustomerId,
}: StoreInvoiceStepInput) {
  "use step";

  if (!lexware) {
    throw new FatalError(
      "LEXWARE_API_KEY is not set in the .env. Cannot store invoice.",
    );
  }

  const invoice = await lexware.retrieveInvoice(createdInvoiceId);

  const totalPrice = invoice.totalPrice;
  if (!totalPrice) {
    throw new FatalError(
      "Expected Lexware invoice to have a total price. Cannot store invoice.",
    );
  }

  const totalTaxAmount = totalPrice.totalTaxAmount;
  const totalGrossAmount = totalPrice.totalGrossAmount;
  if (
    typeof totalTaxAmount !== "number" ||
    typeof totalGrossAmount !== "number"
  ) {
    throw new FatalError(
      "Expected Lexware invoice to have a total tax amount and total gross amount. Cannot store invoice.",
    );
  }

  const voucherNumber = invoice.voucherNumber;
  if (!voucherNumber) {
    throw new FatalError(
      "Expected Lexware invoice to have a voucher number. Cannot store invoice.",
    );
  }

  // Need to round because Lexware may return a float value
  const taxAmountCents = Math.round(totalTaxAmount * 100);
  const totalAmountCents = Math.round(totalGrossAmount * 100);

  const { locale, name, email } = await db.transaction(
    async (tx) => {
      const user = await tx
        .select({
          id: users.id,
          name: users.name,
          locale: users.locale,
          email: users.email,
        })
        .from(users)
        .where(eq(users.stripeCustomerId, stripeCustomerId))
        .limit(1)
        .then(([res]) => res);

      if (!user) {
        throw new FatalError(
          "User with Stripe customer ID not found. Cannot store invoice.",
        );
      }

      await tx
        .insert(invoices)
        .values({
          userId: user.id,
          lexwareInvoiceId: createdInvoiceId,
          number: voucherNumber,
          total: totalAmountCents,
          taxAmount: taxAmountCents,
          reverseCharge: false,
          // Currently we only generate invoices for paid charges
          paidAt: sql`now()`,
        })
        // If the step is retried, the invoice may already exist
        // in which case we don't want to insert a new one
        .onConflictDoNothing({
          target: invoices.lexwareInvoiceId,
        });

      return {
        locale: user.locale,
        name: user.name,
        email: user.email,
      };
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );

  return {
    voucherNumber,
    totalAmountCents,
    taxAmountCents,
    locale,
    name,
    email,
  };
}
