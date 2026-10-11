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

import type { IntegrationHttp } from "@virtbase/integration-sdk";
import { IntegrationError } from "@virtbase/integration-sdk";
import * as z from "zod";
import type { InvoiceForCreate } from "./payload";

const BASE_URL = "https://api.lexware.io/v1";

/** The fields of a Lexware invoice the adapter reads. */
const InvoiceSchema = z.object({
  voucherNumber: z.string().nullish(),
  voucherDate: z.string().nullish(),
  totalPrice: z
    .object({
      totalNetAmount: z.number().nullish(),
      totalTaxAmount: z.number().nullish(),
      totalGrossAmount: z.number().nullish(),
    })
    .nullish(),
});

const CreatedSchema = z.object({ id: z.string() });
const ContactSchema = z.object({ id: z.string() });

/** A Lexware invoice, as far as {@link LexwareClient.retrieveInvoice} reads it. */
export type LexwareInvoice = z.output<typeof InvoiceSchema>;

/**
 * The parts of the Lexware Office API this integration uses, over `ctx.http`
 * (INT-4). It throws `IntegrationError`s: `lexware.request_failed` for an
 * answer other than 2xx, retryable for 429 and 5xx, and
 * `lexware.unexpected_response` for a body that is not Lexware's. Creating an
 * invoice is a POST, which `ctx.http` never retries: a retried create could
 * issue the invoice twice. Whether a caller may repeat a failed create is
 * decided by `isCreateRetryable` in the adapter, not by this flag.
 */
export class LexwareClient {
  private readonly apiKey: string;
  private readonly http: IntegrationHttp;

  constructor({ apiKey, http }: { apiKey: string; http: IntegrationHttp }) {
    this.apiKey = apiKey;
    this.http = http;
  }

  /** Reads a contact; the health probe and the collective-contact check. */
  async retrieveContact(id: string): Promise<{ id: string }> {
    return this.json(
      `/contacts/${encodeURIComponent(id)}`,
      { method: "GET" },
      ContactSchema,
    );
  }

  async retrieveInvoice(id: string): Promise<LexwareInvoice> {
    return this.json(
      `/invoices/${encodeURIComponent(id)}`,
      { method: "GET" },
      InvoiceSchema,
    );
  }

  async createInvoice(
    invoice: InvoiceForCreate,
    params: { finalize?: boolean } = {},
  ): Promise<{ id: string }> {
    return this.json(
      params.finalize ? "/invoices?finalize=true" : "/invoices",
      {
        method: "POST",
        body: JSON.stringify(invoice),
        headers: { "Content-Type": "application/json" },
      },
      CreatedSchema,
    );
  }

  async downloadInvoice(id: string): Promise<ArrayBuffer> {
    const response = await this.request(
      `/invoices/${encodeURIComponent(id)}/file`,
      {
        method: "GET",
        headers: { Accept: "*/*" },
      },
    );
    return response.arrayBuffer();
  }

  private async json<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const response = await this.request(path, init);
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new IntegrationError({
        code: "lexware.unexpected_response",
        message: `${init.method} ${path} answered with a body that is not Lexware's`,
      });
    }
    return parsed.data;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const response = await this.http.request(BASE_URL + path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init.headers,
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new IntegrationError({
        code: "lexware.request_failed",
        message: `${init.method} ${path.split("?")[0]} answered ${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
        params: { status: response.status },
      });
    }
    return response;
  }
}
