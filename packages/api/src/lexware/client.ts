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

import type {
  ContactRetrieveResponse,
  InvoiceCreateResponse,
  InvoiceForCreate,
  InvoiceRetrieveResponse,
} from "./types";

export class LexwareClient {
  private readonly baseUrl = "https://api.lexware.io/v1";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async _request(url: string, options: RequestInit = {}) {
    const response = await fetch(this.baseUrl + url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(
        `[LexwareClient] Failed to request ${url}: ${response.statusText}`,
      );
    }

    return response;
  }

  async retrieveContact(id: string): Promise<ContactRetrieveResponse> {
    const response = await this._request(`/contacts/${id}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    return response.json() as Promise<ContactRetrieveResponse>;
  }

  async retrieveInvoice(id: string): Promise<InvoiceRetrieveResponse> {
    const response = await this._request(`/invoices/${id}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    return response.json() as Promise<InvoiceRetrieveResponse>;
  }

  async createInvoice(
    invoice: InvoiceForCreate,
    params: { finalize?: boolean } = {},
  ): Promise<InvoiceCreateResponse> {
    const url = !params.finalize ? "/invoices" : "/invoices?finalize=true";
    const response = await this._request(url, {
      method: "POST",
      body: JSON.stringify(invoice),
      headers: {
        "Content-Type": "application/json",
      },
    });

    return response.json() as Promise<InvoiceCreateResponse>;
  }

  async downloadInvoice(invoiceId: string): Promise<ArrayBuffer> {
    const response = await this._request(`/invoices/${invoiceId}/file`, {
      method: "GET",
      headers: {
        Accept: "*/*",
      },
    });

    return response.arrayBuffer();
  }
}

export const lexware = process.env.LEXWARE_API_KEY
  ? new LexwareClient(process.env.LEXWARE_API_KEY)
  : null;
