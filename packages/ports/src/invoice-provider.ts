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

import type { Money } from "./common";

export interface InvoiceAddress {
  /** Falls back to the application name when the customer supplied none. */
  name: string | null;
  street: string;
  /** Second address line, where there is one. */
  supplement?: string;
  zip: string;
  city: string;
  /** ISO 3166-1 alpha-2, uppercase. Drives tax treatment. */
  countryCode: string;
}

export interface InvoiceLineItem {
  name: string;
  /** Free text shown under the line's name. */
  description?: string;
  quantity: number;
  /**
   * Gross unit price — tax inclusive. Invoices here are issued to consumers,
   * for whom the gross figure is the one that was actually charged.
   */
  unitPrice: Money;
  /** Percentage, e.g. `19` for German standard VAT. */
  taxRatePercentage: number;
}

export interface CreateInvoiceInput {
  address: InvoiceAddress;
  lineItems: InvoiceLineItem[];
  /**
   * BCP 47 tag for the rendered document. Providers that support a narrower
   * set of languages pick the closest one they have.
   */
  locale: string;
  /** Finalised invoices get a number and become immutable. */
  finalize: boolean;
  /**
   * Our own identifier for what was sold, round-tripped where the provider
   * supports it. Optional until orders become a first-class table in WS5.
   */
  reference?: string;
}

export interface Invoice {
  externalId: string;
  /** Assigned on finalisation; `null` while the invoice is still a draft. */
  number: string | null;
  netAmount: Money | null;
  taxAmount: Money | null;
  grossAmount: Money | null;
  issuedAt: Date | null;
}

/**
 * Issuing customer invoices through an accounting system.
 *
 * The input is deliberately domain-shaped — an address, some line items, a
 * locale. Everything a particular provider needs on top of that (which contact
 * record to bill against, how to express OSS tax treatment, what the document's
 * title and payment terms say) belongs to the adapter, because the next
 * provider will express all of it differently.
 */
export interface InvoiceProvider {
  createInvoice(input: CreateInvoiceInput): Promise<Invoice>;
  retrieveInvoice(externalId: string): Promise<Invoice>;
  /** Rendered PDF bytes, for emailing and for the customer download endpoint. */
  downloadInvoice(externalId: string): Promise<ArrayBuffer>;
}
