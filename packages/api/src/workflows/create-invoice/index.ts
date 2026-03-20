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

import type { OrderConfigurationSnapshot } from "@virtbase/validators";
import { generateInvoiceStep } from "./generate-invoice";
import { sendInvoiceStep } from "./send-invoice";
import { storeInvoiceStep } from "./store-invoice";

type CreateInvoiceWorkflowInput = {
  configuration: OrderConfigurationSnapshot;
  latestChargeId: string;
  stripeCustomerId: string;
};

export async function createInvoiceWorkflow({
  configuration,
  latestChargeId,
  stripeCustomerId,
}: CreateInvoiceWorkflowInput) {
  "use workflow";

  const { createdInvoiceId, customerEmail } = await generateInvoiceStep({
    configuration,
    latestChargeId,
  });

  const {
    voucherNumber,
    totalAmountCents,
    taxAmountCents,
    locale,
    name,
    email,
  } = await storeInvoiceStep({
    createdInvoiceId,
    latestChargeId,
    stripeCustomerId,
  });

  await sendInvoiceStep({
    createdInvoiceId,
    voucherNumber,
    totalAmountCents,
    taxAmountCents,
    // Either billing details email from stripe or user email from database
    customerEmail: customerEmail || email,
    locale,
    name,
  });
}
