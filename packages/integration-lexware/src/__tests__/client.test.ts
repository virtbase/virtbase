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
import { IntegrationError } from "@virtbase/integration-sdk";
import { COUNTRY_CONTACTS } from "../constants";
import type { InvoiceForCreate } from "../payload";
import { API_KEY, clientOn, createFakeLexware } from "./fake-lexware";

const INVOICE: InvoiceForCreate = {
  archived: false,
  voucherDate: "2026-10-11T00:00:00.000Z",
  language: "de",
  address: {
    contactId: COUNTRY_CONTACTS.DE,
    name: "Ada Lovelace",
    street: "Hauptstraße 1",
    city: "Berlin",
    zip: "10115",
    countryCode: "DE",
  },
  lineItems: [
    {
      type: "custom",
      name: "VPS Small",
      quantity: 1,
      unitName: "Stück",
      unitPrice: { currency: "EUR", grossAmount: 11.9, taxRatePercentage: 19 },
      discountPercentage: 0,
    },
  ],
  totalPrice: { currency: "EUR" },
  taxConditions: { taxType: "gross" },
  shippingConditions: {
    shippingType: "service",
    shippingDate: "2026-10-11T00:00:00.000Z",
  },
  title: "Rechnung",
  introduction: "Wir stellen unsere Leistungen Ihnen wie folgt in Rechnung:",
  remark: "Vielen Dank!",
  paymentConditions: { paymentTermDuration: 7, paymentTermLabel: "Bezahlt" },
};

describe("LexwareClient", () => {
  test("sends the key as a bearer token", async () => {
    const fake = createFakeLexware(API_KEY);

    expect(await clientOn(fake).retrieveContact(COUNTRY_CONTACTS.DE)).toEqual({
      id: COUNTRY_CONTACTS.DE,
    });
  });

  test("throws a non-retryable request_failed for a rejected key, without the key", async () => {
    const fake = createFakeLexware(API_KEY);

    const error = await clientOn(fake, "lexware-wrong-key-0123456789")
      .retrieveContact(COUNTRY_CONTACTS.DE)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({
      code: "lexware.request_failed",
      retryable: false,
      params: { status: 401 },
      message: `GET /contacts/${COUNTRY_CONTACTS.DE} answered 401`,
    });
  });

  test("retries a read Lexware could not answer, and marks the last failure retryable", async () => {
    const fake = createFakeLexware(API_KEY);
    fake.answerWith(503, { message: "Service Unavailable" });

    const error = await clientOn(fake)
      .retrieveInvoice("abc")
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "lexware.request_failed",
      retryable: true,
    });
    expect(fake.requests()).toBe(3);
  });

  test("never retries creating an invoice, which could issue it twice", async () => {
    const fake = createFakeLexware(API_KEY);
    fake.answerWith(503, { message: "Service Unavailable" });

    const error = await clientOn(fake)
      .createInvoice(INVOICE)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "lexware.request_failed" });
    expect(fake.requests()).toBe(1);
  });

  test("drops the query string from the message of a failed create", async () => {
    const fake = createFakeLexware(API_KEY);
    fake.answerWith(400, { message: "Bad Request" });

    const error = await clientOn(fake)
      .createInvoice(INVOICE, { finalize: true })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      message: "POST /invoices answered 400",
    });
  });

  test("throws unexpected_response for a body that is not JSON", async () => {
    const client = clientOn({
      fetch: async () => new Response("<html>maintenance</html>"),
    });

    const error = await client
      .retrieveContact(COUNTRY_CONTACTS.DE)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "lexware.unexpected_response" });
  });
});
