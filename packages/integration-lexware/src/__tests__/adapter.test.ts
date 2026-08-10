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
import type { CreateInvoiceInput } from "@virtbase/ports";
import { PortError } from "@virtbase/ports";
import { LexwareInvoiceProvider } from "../adapter";
import type { LexwareClient } from "../client";
import { COUNTRY_CONTACTS } from "../constants";
import type { CustomLineItem, InvoiceForCreate } from "../types";

/**
 * These pin the exact Lexware payload the adapter builds.
 *
 * The construction moved here verbatim out of the invoice workflow, which had
 * no tests. Invoices are a money path with tax consequences, so the shape is
 * asserted field by field rather than trusted to a refactor.
 */

const capturingClient = (
  overrides: Partial<LexwareClient> = {},
): { client: LexwareClient; payloads: InvoiceForCreate[] } => {
  const payloads: InvoiceForCreate[] = [];

  const client = {
    retrieveContact: async () => ({}) as never,
    createInvoice: async (invoice: InvoiceForCreate) => {
      payloads.push(invoice);
      return { id: "created-id" } as never;
    },
    retrieveInvoice: async () => ({
      voucherNumber: "RE-2026-0001",
      voucherDate: "2026-08-09T00:00:00.000Z",
      totalPrice: {
        totalNetAmount: 100,
        totalTaxAmount: 19,
        totalGrossAmount: 119,
      },
    }),
    downloadInvoice: async () => new ArrayBuffer(8),
    ...overrides,
  } as unknown as LexwareClient;

  return { client, payloads };
};

const input = (
  overrides: Partial<CreateInvoiceInput> = {},
): CreateInvoiceInput => ({
  address: {
    name: "Ada Lovelace",
    street: "Hauptstraße 1",
    zip: "10115",
    city: "Berlin",
    countryCode: "DE",
  },
  lineItems: [
    {
      name: "VPS Small",
      description: "• 2 vCores",
      quantity: 1,
      unitPrice: { amount: 1190, currency: "EUR" },
      taxRatePercentage: 19,
    },
  ],
  locale: "de",
  finalize: true,
  ...overrides,
});

describe("createInvoice payload", () => {
  test("bills the home country against its collective contact, without OSS", async () => {
    const { client, payloads } = capturingClient();

    await new LexwareInvoiceProvider(client).createInvoice(input());

    const [payload] = payloads;
    expect(payload?.address).toEqual({
      name: "Ada Lovelace",
      city: "Berlin",
      contactId: COUNTRY_CONTACTS.DE,
      countryCode: "DE",
      street: "Hauptstraße 1",
      zip: "10115",
    });
    // Domestic sales are not electronic services under the One-Stop-Shop.
    expect(payload?.taxConditions).toEqual({ taxType: "gross" });
    expect(payload?.language).toBe("de");
    expect(payload?.title).toBe("Rechnung");
  });

  test("marks other countries as OSS electronic services", async () => {
    const { client, payloads } = capturingClient();

    await new LexwareInvoiceProvider(client).createInvoice(
      input({
        address: {
          name: "Ada Lovelace",
          street: "1 rue de Rivoli",
          zip: "75001",
          city: "Paris",
          countryCode: "FR",
        },
        locale: "fr",
      }),
    );

    const [payload] = payloads;
    expect(payload?.taxConditions).toEqual({
      taxType: "gross",
      taxSubType: "electronicServices",
    } as never);
    expect(payload?.address?.contactId).toBe(COUNTRY_CONTACTS.FR);
    // Lexware renders only German and English documents.
    expect(payload?.language).toBe("en");
    expect(payload?.title).toBe("Facture");
  });

  test("converts cents to the euro floats Lexware expects", async () => {
    const { client, payloads } = capturingClient();

    await new LexwareInvoiceProvider(client).createInvoice(input());

    // The payload type is a union of line-item kinds; the adapter only ever
    // emits the custom kind.
    const line = payloads[0]?.lineItems?.[0] as CustomLineItem;

    expect(line.unitPrice).toEqual({
      currency: "EUR",
      grossAmount: 11.9,
      taxRatePercentage: 19,
    });
    expect(line.unitName).toBe("Stück");
    expect(line.discountPercentage).toBe(0);
  });

  test("falls back to the application name when the customer gave none", async () => {
    const { client, payloads } = capturingClient();

    await new LexwareInvoiceProvider(client).createInvoice(
      input({
        address: {
          name: null,
          street: "Hauptstraße 1",
          zip: "10115",
          city: "Berlin",
          countryCode: "DE",
        },
      }),
    );

    expect(payloads[0]?.address?.name).toBeTruthy();
  });

  test("omits the address supplement when there is no second line", async () => {
    const { client, payloads } = capturingClient();

    await new LexwareInvoiceProvider(client).createInvoice(input());

    expect(payloads[0]?.address).not.toHaveProperty("supplement");
  });

  test("passes the finalize flag through", async () => {
    const calls: { finalize?: boolean }[] = [];
    const { client } = capturingClient({
      createInvoice: (async (
        _invoice: InvoiceForCreate,
        params: { finalize?: boolean },
      ) => {
        calls.push(params);
        return { id: "created-id" };
      }) as never,
    });

    await new LexwareInvoiceProvider(client).createInvoice(
      input({ finalize: false }),
    );

    expect(calls[0]).toEqual({ finalize: false });
  });
});

describe("failure handling", () => {
  test("refuses a country with no collective contact", async () => {
    const { client, payloads } = capturingClient();

    const promise = new LexwareInvoiceProvider(client).createInvoice(
      input({
        address: {
          name: "Ada",
          street: "1 Main St",
          zip: "10001",
          city: "New York",
          countryCode: "US",
        },
      }),
    );

    await expect(promise).rejects.toBeInstanceOf(PortError);
    // Nothing must reach Lexware: billing the default contact would produce a
    // plausible invoice made out to the wrong party.
    expect(payloads).toHaveLength(0);
  });

  test("refuses when the configured contact does not exist", async () => {
    const { client, payloads } = capturingClient({
      retrieveContact: (async () => {
        throw new Error("404");
      }) as never,
    });

    await expect(
      new LexwareInvoiceProvider(client).createInvoice(input()),
    ).rejects.toBeInstanceOf(PortError);
    expect(payloads).toHaveLength(0);
  });
});

describe("retrieveInvoice", () => {
  test("returns amounts in cents", async () => {
    const { client } = capturingClient();

    const invoice = await new LexwareInvoiceProvider(client).retrieveInvoice(
      "abc",
    );

    expect(invoice).toEqual({
      externalId: "abc",
      number: "RE-2026-0001",
      netAmount: { amount: 10_000, currency: "EUR" },
      taxAmount: { amount: 1_900, currency: "EUR" },
      grossAmount: { amount: 11_900, currency: "EUR" },
      issuedAt: new Date("2026-08-09T00:00:00.000Z"),
    });
  });

  test("rounds the floats Lexware returns", async () => {
    const { client } = capturingClient({
      retrieveInvoice: (async () => ({
        voucherNumber: "RE-1",
        totalPrice: { totalTaxAmount: 19.005, totalGrossAmount: 119.005 },
      })) as never,
    });

    const invoice = await new LexwareInvoiceProvider(client).retrieveInvoice(
      "abc",
    );

    expect(invoice.taxAmount?.amount).toBe(1901);
    expect(invoice.grossAmount?.amount).toBe(11901);
  });
});
