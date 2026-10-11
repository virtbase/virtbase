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

import { describe, expect, test } from "bun:test";
import type { Invoice, InvoiceProvider } from "@virtbase/ports";
import { PortError } from "@virtbase/ports";
import { describeInvoiceProvider, runInvoiceContract } from "../invoice";

interface Defects {
  /** Reports amounts in major units, as a provider's floats. */
  majorUnits?: boolean;
  /** Numbers every invoice, drafts included. */
  ignoresFinalize?: boolean;
  /** Rejects an unknown invoice with a plain Error. */
  plainErrors?: boolean;
}

/** An in-memory provider that keeps the contract, unless told otherwise. */
const referenceProvider = async (defects: Defects = {}) => {
  const invoices = new Map<string, Invoice>();
  const unit = defects.majorUnits ? 100 : 1;
  const provider: InvoiceProvider = {
    createInvoice: async ({ lineItems, finalize }) => {
      const gross = lineItems.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice.amount,
        0,
      );
      const net = Math.round(gross / 1.19);
      const externalId = `inv-${invoices.size + 1}`;
      const invoice: Invoice = {
        externalId,
        number:
          finalize || defects.ignoresFinalize
            ? `RE-${invoices.size + 1}`
            : null,
        netAmount: { amount: net / unit, currency: "EUR" },
        taxAmount: { amount: (gross - net) / unit, currency: "EUR" },
        grossAmount: { amount: gross / unit, currency: "EUR" },
        issuedAt: new Date("2026-10-11T00:00:00Z"),
      };
      invoices.set(externalId, invoice);
      return invoice;
    },
    retrieveInvoice: async (externalId) => {
      const invoice = invoices.get(externalId);
      if (invoice) return invoice;
      throw defects.plainErrors
        ? new Error("not found")
        : new PortError("not found", {
            port: "invoice",
            integrationId: "reference",
          });
    },
    downloadInvoice: async () => new TextEncoder().encode("%PDF-1.7").buffer,
  };
  return {
    provider,
    address: {
      name: "Ada Lovelace",
      street: "Hauptstraße 1",
      zip: "10115",
      city: "Berlin",
      countryCode: "DE",
    },
  };
};

const failedTitles = async (defects: Defects) =>
  (await runInvoiceContract(() => referenceProvider(defects))).map((failure) =>
    failure.slice(0, failure.indexOf(":")),
  );

describeInvoiceProvider("the reference provider", () => referenceProvider());

describe("runInvoiceContract", () => {
  test("fails a provider that reports amounts in major units", async () => {
    expect(await failedTitles({ majorUnits: true })).toEqual([
      "the gross amount is the sum of the gross line items, in minor units, and net plus tax make it up",
    ]);
  });

  test("fails a provider that numbers drafts", async () => {
    expect(await failedTitles({ ignoresFinalize: true })).toEqual([
      "a draft, created without finalising, has no number",
    ]);
  });

  test("fails a provider that rejects with a plain Error", async () => {
    expect(await failedTitles({ plainErrors: true })).toEqual([
      "an unknown invoice is rejected with a PortError of the invoice port",
    ]);
  });
});
