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

import { expect } from "bun:test";
import type {
  CreateInvoiceInput,
  InvoiceAddress,
  InvoiceProvider,
} from "@virtbase/ports";
import { PortError } from "@virtbase/ports";
import type { Check } from "../checks/run";
import { describeChecks, runChecks } from "../checks/run";

/** What the `invoice` contract suite needs from an integration's tests. */
export interface InvoiceContractSetup {
  /** The provider under test, talking to a fresh fake. */
  provider: InvoiceProvider;
  /** An address the provider can bill. */
  address: InvoiceAddress;
}

/** Two gross-priced lines, one with a quantity above one. */
const LINE_ITEMS: CreateInvoiceInput["lineItems"] = [
  {
    name: "Server S",
    description: "2 vCores",
    quantity: 1,
    unitPrice: { amount: 1190, currency: "EUR" },
    taxRatePercentage: 19,
  },
  {
    name: "Extra IPv4",
    quantity: 2,
    unitPrice: { amount: 500, currency: "EUR" },
    taxRatePercentage: 19,
  },
];

const EXPECTED_GROSS = LINE_ITEMS.reduce(
  (sum, item) => sum + item.quantity * item.unitPrice.amount,
  0,
);

const UNKNOWN_INVOICE_ID = "00000000-0000-4000-8000-000000000000";

const create = (
  { provider, address }: InvoiceContractSetup,
  overrides: Partial<CreateInvoiceInput> = {},
) =>
  provider.createInvoice({
    address,
    lineItems: LINE_ITEMS,
    locale: "en",
    finalize: true,
    ...overrides,
  });

const INVOICE_CHECKS: Check<InvoiceContractSetup>[] = [
  {
    title:
      "createInvoice() finalises an invoice with a number and an issue date",
    run: async (setup) => {
      const invoice = await create(setup);
      expect(invoice.externalId).toBeTruthy();
      expect(invoice.number).toBeTruthy();
      expect(invoice.issuedAt).toBeInstanceOf(Date);
    },
  },
  {
    title:
      "the gross amount is the sum of the gross line items, in minor units, and net plus tax make it up",
    run: async (setup) => {
      const { netAmount, taxAmount, grossAmount } = await create(setup);
      expect(grossAmount).toEqual({ amount: EXPECTED_GROSS, currency: "EUR" });
      expect(netAmount?.currency).toBe("EUR");
      expect(taxAmount?.currency).toBe("EUR");
      expect((netAmount?.amount ?? 0) + (taxAmount?.amount ?? 0)).toBe(
        EXPECTED_GROSS,
      );
    },
  },
  {
    title: "retrieveInvoice() returns what createInvoice() returned",
    run: async (setup) => {
      const created = await create(setup);
      expect(await setup.provider.retrieveInvoice(created.externalId)).toEqual(
        created,
      );
    },
  },
  {
    title: "a draft, created without finalising, has no number",
    run: async (setup) => {
      expect((await create(setup, { finalize: false })).number).toBeNull();
    },
  },
  {
    title: "a locale the provider has no copy for still issues the invoice",
    run: async (setup) => {
      expect((await create(setup, { locale: "xx-YY" })).number).toBeTruthy();
    },
  },
  {
    title: "downloadInvoice() returns the rendered document's bytes",
    run: async (setup) => {
      const { externalId } = await create(setup);
      expect(
        (await setup.provider.downloadInvoice(externalId)).byteLength,
      ).toBeGreaterThan(0);
    },
  },
  {
    title:
      "an unknown invoice is rejected with a PortError of the invoice port",
    run: async ({ provider }) => {
      const error = await provider
        .retrieveInvoice(UNKNOWN_INVOICE_ID)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(PortError);
      expect(error).toMatchObject({ port: "invoice" });
    },
  },
];

/**
 * The `invoice` port contract (§4.8 of integration-first.md): every provider
 * runs it against its own fake. `setup` runs before each check.
 *
 * It proves the round trip the invoice workflow depends on: create, read back,
 * download, with amounts as integer minor units that add up.
 */
export const describeInvoiceProvider = (
  name: string,
  setup: () => Promise<InvoiceContractSetup>,
): void => describeChecks(`${name} provides invoice`, INVOICE_CHECKS, setup);

/** Runs the `invoice` contract and returns one line per failed check, for the suite's own tests. */
export const runInvoiceContract = (
  setup: () => Promise<InvoiceContractSetup>,
): Promise<string[]> => runChecks(INVOICE_CHECKS, setup);
