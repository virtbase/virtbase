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
import { orderItems, orders } from "@virtbase/db/schema";
import type { InvoiceCountry } from "../lib/invoicing";
import { EU_VAT_RATES } from "../lib/invoicing";

export interface OrderBillingAddress {
  name: string | null;
  email: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
  };
}

/**
 * Attaches the billing address to an order and prices its tax.
 *
 * Deliberately separate from `createOrder`: the address is not known at
 * checkout. Stripe collects it inside the payment element and it only becomes
 * readable from the charge once the payment has succeeded, which is why the tax
 * rate on an order line starts as `null` rather than zero.
 *
 * Recording it here also means the order carries everything invoicing needs, so
 * neither provider has to smuggle the address through payment metadata.
 */
export const recordBillingDetails = async (
  orderId: string,
  billingDetails: OrderBillingAddress,
): Promise<void> => {
  const country = billingDetails.address.country;
  const taxRatePercentage = country
    ? (EU_VAT_RATES[country as InvoiceCountry] ?? null)
    : null;

  await db.transaction(
    async (tx) => {
      await tx
        .update(orders)
        .set({ billingAddress: billingDetails })
        .where(eq(orders.id, orderId));

      // A country outside the configured table leaves the rate unset rather
      // than defaulting to zero — a wrong tax rate on an invoice is worse than
      // an obviously missing one.
      if (taxRatePercentage !== null) {
        await tx
          .update(orderItems)
          .set({ taxRatePercentage })
          .where(eq(orderItems.orderId, orderId));
      }
    },
    {
      accessMode: "read write",
      isolationLevel: "read committed",
    },
  );
};
