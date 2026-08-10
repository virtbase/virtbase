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

import type { AbstractIntlMessages, Locale } from "use-intl";

/**
 * Text of the invoice document itself.
 *
 * Provider-owned on purpose: the title, introduction and payment terms are part
 * of how this accounting system renders a PDF, not a description of what was
 * sold. What was sold is the line item, which the caller supplies already
 * worded.
 */
export const invoiceMessages = {
  en: {
    unitName: "Piece",
    invoiceTitle: "Invoice",
    introduction: "We invoice our services to you as follows:",
    remark: "Thank you for your purchase at {appName}!",
    paymentConditionText:
      "This invoice has already been paid, please do not transfer.",
  },
  de: {
    unitName: "Stück",
    invoiceTitle: "Rechnung",
    introduction: "Wir stellen unsere Leistungen Ihnen wie folgt in Rechnung:",
    remark: "Vielen Dank für Ihren Einkauf bei {appName}!",
    paymentConditionText:
      "Diese Rechnung ist bereits bezahlt, bitte nicht überweisen.",
  },
  nl: {
    unitName: "Stuk",
    invoiceTitle: "Factuur",
    introduction: "We factureren onze diensten aan u als volgt:",
    remark: "Bedankt voor uw aankoop bij {appName}!",
    paymentConditionText:
      "Deze factuur is al betaald, gelieve niet over te maken.",
  },
  fr: {
    unitName: "Unité",
    invoiceTitle: "Facture",
    introduction: "Nous facturons nos services à vous comme suit :",
    remark: "Merci pour votre achat chez {appName} !",
    paymentConditionText:
      "Cette facture est déjà payée, veuillez ne pas transférer.",
  },
} satisfies Record<Locale, AbstractIntlMessages>;

export type InvoiceMessageLocale = keyof typeof invoiceMessages;

/**
 * Narrows an arbitrary BCP 47 tag to a locale this provider has copy for,
 * falling back to English.
 */
export const resolveInvoiceLocale = (locale: string): InvoiceMessageLocale => {
  const base = locale.split("-")[0] ?? "";
  return base in invoiceMessages ? (base as InvoiceMessageLocale) : "en";
};
