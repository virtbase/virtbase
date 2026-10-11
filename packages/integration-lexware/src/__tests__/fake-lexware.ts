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

import type { FetchLike } from "@virtbase/integration-sdk";
import {
  createIntegrationHttp,
  createRedactor,
} from "@virtbase/integration-sdk";
import type { LexwareInvoice } from "../client";
import { LexwareClient } from "../client";
import { COUNTRY_CONTACTS } from "../constants";
import type { InvoiceForCreate } from "../payload";
import { InvoiceForCreateSchema } from "../payload";

/** Euros with two decimals, as Lexware writes amounts. */
const euros = (cents: number) => cents / 100;

/**
 * Lexware's totals for gross-priced lines: each line's gross amount, split
 * into net and tax at its rate, summed in cents.
 */
const totalsOf = (payload: InvoiceForCreate) => {
  let gross = 0;
  let net = 0;
  for (const { quantity, unitPrice } of payload.lineItems) {
    const lineGross = Math.round(quantity * unitPrice.grossAmount * 100);
    gross += lineGross;
    net += Math.round(lineGross / (1 + unitPrice.taxRatePercentage / 100));
  }
  return {
    totalNetAmount: euros(net),
    totalTaxAmount: euros(gross - net),
    totalGrossAmount: euros(gross),
  };
};

/**
 * A fake Lexware Office API as a `fetch`, behind a bearer token:
 * `GET /contacts/:id` for each of `contacts`, `POST /invoices` (validated
 * against {@link InvoiceForCreateSchema}, numbered only with `finalize=true`),
 * `GET /invoices/:id` and `GET /invoices/:id/file`. `answerWith` makes every
 * request answer that status and body.
 */
export const createFakeLexware = (
  apiKey: string,
  contacts: readonly string[] = Object.values(COUNTRY_CONTACTS),
) => {
  const invoices = new Map<string, LexwareInvoice>();
  const payloads: InvoiceForCreate[] = [];
  const finalizeFlags: boolean[] = [];
  let requests = 0;
  let override: { status: number; body: unknown } | null = null;
  let createFailure: number | null = null;
  let readFailure: number | null = null;

  const notFound = () =>
    Response.json({ status: 404, message: "Not Found" }, { status: 404 });

  const createInvoice = (url: URL, body: unknown) => {
    const parsed = InvoiceForCreateSchema.safeParse(JSON.parse(String(body)));
    if (!parsed.success) {
      return Response.json({ message: parsed.error.message }, { status: 406 });
    }
    const finalize = url.searchParams.get("finalize") === "true";
    payloads.push(parsed.data);
    finalizeFlags.push(finalize);
    const id = crypto.randomUUID();
    invoices.set(id, {
      voucherNumber: finalize
        ? `RE${String(invoices.size + 1).padStart(4, "0")}`
        : null,
      voucherDate: parsed.data.voucherDate,
      totalPrice: totalsOf(parsed.data),
    });
    if (createFailure) {
      return Response.json({ message: "failed" }, { status: createFailure });
    }
    return Response.json({
      id,
      resourceUri: `${url.origin}/v1/invoices/${id}`,
    });
  };

  const routes: [RegExp, (url: URL, id: string, body: unknown) => Response][] =
    [
      [/^POST \/invoices$/, (url, _, body) => createInvoice(url, body)],
      [
        /^GET \/contacts\/([^/]+)$/,
        (_, id) => (contacts.includes(id) ? Response.json({ id }) : notFound()),
      ],
      [
        /^GET \/invoices\/([^/]+)$/,
        (_, id) => {
          if (readFailure) {
            return Response.json(
              { message: "failed" },
              { status: readFailure },
            );
          }
          const invoice = invoices.get(id);
          return invoice ? Response.json({ id, ...invoice }) : notFound();
        },
      ],
      [
        /^GET \/invoices\/([^/]+)\/file$/,
        (_, id) =>
          invoices.has(id) ? new Response(`%PDF-1.7 ${id}`) : notFound(),
      ],
    ];

  const route = (method: string, url: URL, body: unknown): Response => {
    const request = `${method} ${url.pathname.replace(/^\/v1/, "")}`;
    for (const [pattern, answer] of routes) {
      const match = pattern.exec(request);
      if (match) return answer(url, decodeURIComponent(match[1] ?? ""), body);
    }
    return notFound();
  };

  const fetch: FetchLike = async (input, init) => {
    requests++;
    if (override) return Response.json(override.body, override);
    if (
      new Headers(init?.headers).get("authorization") !== `Bearer ${apiKey}`
    ) {
      return Response.json({ message: "Unauthorized" }, { status: 401 });
    }
    return route(init?.method ?? "GET", new URL(String(input)), init?.body);
  };

  return {
    fetch,
    payloads,
    finalizeFlags,
    requests: () => requests,
    /** Stores an invoice as Lexware would answer it. */
    seedInvoice: (id: string, invoice: LexwareInvoice) => {
      invoices.set(id, invoice);
    },
    answerWith: (status: number, body: unknown) => {
      override = { status, body };
    },
    /** Stores every created invoice, then answers the create with `status`. */
    failCreatesAfterStoring: (status: number) => {
      createFailure = status;
    },
    /** Answers `GET /invoices/:id` with `status`. */
    failReads: (status: number) => {
      readFailure = status;
    },
  };
};

/** The key the fake accepts unless a test passes its own. */
export const API_KEY = "lexware-test-key-0123456789";

/** A {@link LexwareClient} on `fake`, whose retries do not wait. */
export const clientOn = (fake: { fetch: FetchLike }, apiKey = API_KEY) =>
  new LexwareClient({
    apiKey,
    http: createIntegrationHttp({
      integrationId: "lexware",
      redactor: createRedactor([apiKey]),
      fetch: fake.fetch,
      sleep: async () => {},
    }),
  });
