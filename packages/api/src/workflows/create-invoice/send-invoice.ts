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

import { sendEmail } from "@virtbase/email";
import InvoiceCreated from "@virtbase/email/templates/invoice-created";
import { getEmailTitle } from "@virtbase/email/translations";
import { FatalError, getStepMetadata } from "workflow";
import { lexware } from "../../lexware";

type SendInvoiceStepInput = {
  createdInvoiceId: string;
  voucherNumber: string;
  totalAmountCents: number;
  taxAmountCents: number;
  customerEmail: string;
  locale?: string | null;
  name: string;
};

export async function sendInvoiceStep({
  createdInvoiceId,
  voucherNumber,
  totalAmountCents,
  taxAmountCents,
  customerEmail,
  locale,
  name,
}: SendInvoiceStepInput) {
  "use step";

  if (!lexware) {
    throw new FatalError(
      "LEXWARE_API_KEY is not set in the .env. Cannot download and send invoice.",
    );
  }

  let fileContent: ArrayBuffer;
  try {
    fileContent = await lexware.downloadInvoice(createdInvoiceId);
  } catch {
    throw new FatalError(
      "Failed to download invoice from Lexware. Cannot send invoice.",
    );
  }

  const { stepId } = getStepMetadata();

  await sendEmail(
    {
      to: customerEmail,
      subject: await getEmailTitle("invoice-created", locale),
      attachments: [
        {
          filename: `${createdInvoiceId}.pdf`,
          contentType: "application/pdf",
          content: Buffer.from(fileContent),
        },
      ],
      react: InvoiceCreated({
        name,
        email: customerEmail,
        voucherNumber,
        totalAmountCents,
        taxAmountCents,
        locale,
      }),
    },
    {
      idempotencyKey: stepId,
    },
  );
}
