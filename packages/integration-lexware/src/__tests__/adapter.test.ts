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
import { COUNTRY_CONTACTS } from "../constants";
import { API_KEY, clientOn, createFakeLexware } from "./fake-lexware";

const providerOn = (fake: ReturnType<typeof createFakeLexware>) =>
  new LexwareInvoiceProvider(clientOn(fake));

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

const PARIS = {
  name: "Ada Lovelace",
  street: "1 rue de Rivoli",
  zip: "75001",
  city: "Paris",
  countryCode: "FR",
};

/*
 * The "createInvoice payload" tests assert the Lexware payload field by field:
 * invoices are a money path with tax consequences.
 */
describe("createInvoice payload", () => {
  test("bills the home country against its collective contact, without OSS", async () => {
    const fake = createFakeLexware(API_KEY);

    await providerOn(fake).createInvoice(input());

    const [payload] = fake.payloads;
    expect(payload?.address).toEqual({
      name: "Ada Lovelace",
      city: "Berlin",
      contactId: COUNTRY_CONTACTS.DE,
      countryCode: "DE",
      street: "Hauptstraße 1",
      zip: "10115",
    });
    expect(payload?.taxConditions).toEqual({ taxType: "gross" });
    expect(payload?.language).toBe("de");
    expect(payload?.title).toBe("Rechnung");
  });

  test("marks other countries as OSS electronic services, in English", async () => {
    const fake = createFakeLexware(API_KEY);

    await providerOn(fake).createInvoice(
      input({ address: PARIS, locale: "fr" }),
    );

    const [payload] = fake.payloads;
    expect(payload?.taxConditions).toEqual({
      taxType: "gross",
      taxSubType: "electronicServices",
    });
    expect(payload?.address.contactId).toBe(COUNTRY_CONTACTS.FR);
    expect(payload?.language).toBe("en");
    expect(payload?.title).toBe("Facture");
  });

  test("converts cents to the euro floats Lexware expects", async () => {
    const fake = createFakeLexware(API_KEY);

    await providerOn(fake).createInvoice(input());

    const line = fake.payloads[0]?.lineItems[0];
    expect(line?.unitPrice).toEqual({
      currency: "EUR",
      grossAmount: 11.9,
      taxRatePercentage: 19,
    });
    expect(line?.unitName).toBe("Stück");
    expect(line?.discountPercentage).toBe(0);
  });

  test("falls back to the application name when the customer gave none", async () => {
    const fake = createFakeLexware(API_KEY);

    await providerOn(fake).createInvoice(
      input({ address: { ...input().address, name: null } }),
    );

    expect(fake.payloads[0]?.address.name).toBeTruthy();
  });

  test("carries the address supplement only when there is a second line", async () => {
    const fake = createFakeLexware(API_KEY);
    const provider = providerOn(fake);

    await provider.createInvoice(input());
    await provider.createInvoice(
      input({ address: { ...input().address, supplement: "Hinterhaus" } }),
    );

    expect(fake.payloads[0]?.address).not.toHaveProperty("supplement");
    expect(fake.payloads[1]?.address.supplement).toBe("Hinterhaus");
  });

  test("passes the finalize flag through", async () => {
    const fake = createFakeLexware(API_KEY);
    const provider = providerOn(fake);

    await provider.createInvoice(input({ finalize: false }));
    await provider.createInvoice(input({ finalize: true }));

    expect(fake.finalizeFlags).toEqual([false, true]);
  });
});

describe("createInvoice failures", () => {
  test("refuses a country with no collective contact before calling Lexware", async () => {
    const fake = createFakeLexware(API_KEY);

    const promise = providerOn(fake).createInvoice(
      input({ address: { ...input().address, countryCode: "US" } }),
    );

    await expect(promise).rejects.toBeInstanceOf(PortError);
    expect(fake.requests()).toBe(0);
  });

  test("refuses a country code that names an Object prototype key", async () => {
    const fake = createFakeLexware(API_KEY);

    const promise = providerOn(fake).createInvoice(
      input({ address: { ...input().address, countryCode: "constructor" } }),
    );

    await expect(promise).rejects.toMatchObject({
      message: "No collective contact is configured for country constructor.",
    });
    expect(fake.requests()).toBe(0);
  });

  test("refuses when the collective contact does not exist, without retrying", async () => {
    const fake = createFakeLexware(API_KEY, []);

    const error = await providerOn(fake)
      .createInvoice(input())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({
      message: `The collective contact ${COUNTRY_CONTACTS.DE} does not exist in Lexware.`,
      retryable: false,
    });
    expect(fake.payloads).toHaveLength(0);
  });

  test("marks a contact lookup Lexware could not answer as retryable", async () => {
    const fake = createFakeLexware(API_KEY);
    fake.answerWith(503, { message: "Service Unavailable" });

    const error = await providerOn(fake)
      .createInvoice(input())
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      message: `Failed to look up the collective contact ${COUNTRY_CONTACTS.DE}.`,
      retryable: true,
    });
  });

  test("reports a rejected payload as a PortError", async () => {
    const fake = createFakeLexware(API_KEY);

    const error = await providerOn(fake)
      .createInvoice(input({ lineItems: [] }))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({
      message: "Failed to create the invoice.",
      retryable: false,
    });
  });
});

describe("createInvoice retries", () => {
  test("marks a create Lexware may have carried out as not retryable", async () => {
    const fake = createFakeLexware(API_KEY);
    fake.failCreatesAfterStoring(500);

    const error = await providerOn(fake)
      .createInvoice(input())
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      message: "Failed to create the invoice.",
      retryable: false,
    });
    expect(fake.payloads).toHaveLength(1);
  });

  test("marks a create Lexware rate limited as retryable", async () => {
    const fake = createFakeLexware(API_KEY);
    fake.failCreatesAfterStoring(429);

    await expect(providerOn(fake).createInvoice(input())).rejects.toMatchObject(
      { retryable: true },
    );
  });

  test("never marks a failed read-back retryable, and names the created invoice", async () => {
    const fake = createFakeLexware(API_KEY);
    fake.failReads(503);

    const error = await providerOn(fake)
      .createInvoice(input())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({ retryable: false });
    expect(String(error)).toMatch(
      /Invoice [0-9a-f-]{36} was created, but reading it back failed\./,
    );
    expect(fake.payloads).toHaveLength(1);
  });
});

describe("retrieveInvoice", () => {
  test("returns amounts in cents", async () => {
    const fake = createFakeLexware(API_KEY);
    fake.seedInvoice("abc", {
      voucherNumber: "RE-2026-0001",
      voucherDate: "2026-08-09T00:00:00.000Z",
      totalPrice: {
        totalNetAmount: 100,
        totalTaxAmount: 19,
        totalGrossAmount: 119,
      },
    });

    expect(await providerOn(fake).retrieveInvoice("abc")).toEqual({
      externalId: "abc",
      number: "RE-2026-0001",
      netAmount: { amount: 10_000, currency: "EUR" },
      taxAmount: { amount: 1_900, currency: "EUR" },
      grossAmount: { amount: 11_900, currency: "EUR" },
      issuedAt: new Date("2026-08-09T00:00:00.000Z"),
    });
  });

  test("rounds the floats Lexware returns", async () => {
    const fake = createFakeLexware(API_KEY);
    fake.seedInvoice("abc", {
      voucherNumber: "RE-1",
      totalPrice: { totalTaxAmount: 19.005, totalGrossAmount: 119.005 },
    });

    const invoice = await providerOn(fake).retrieveInvoice("abc");

    expect(invoice.taxAmount?.amount).toBe(1901);
    expect(invoice.grossAmount?.amount).toBe(11901);
    expect(invoice.netAmount).toBeNull();
    expect(invoice.issuedAt).toBeNull();
  });

  test("marks an answer that is not Lexware's as not retryable", async () => {
    const fake = createFakeLexware(API_KEY);
    fake.answerWith(200, { voucherNumber: 42 });

    const error = await providerOn(fake)
      .retrieveInvoice("abc")
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      retryable: false,
      cause: { code: "lexware.unexpected_response" },
    });
  });
});

describe("downloadInvoice", () => {
  test("returns the PDF bytes", async () => {
    const fake = createFakeLexware(API_KEY);
    fake.seedInvoice("abc", { voucherNumber: "RE-1" });

    const bytes = await providerOn(fake).downloadInvoice("abc");

    expect(new TextDecoder().decode(bytes)).toBe("%PDF-1.7 abc");
  });

  test("marks a failed download as retryable", async () => {
    const fake = createFakeLexware(API_KEY);
    fake.answerWith(502, { message: "Bad Gateway" });

    const error = await providerOn(fake)
      .downloadInvoice("abc")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({ retryable: true });
  });
});
