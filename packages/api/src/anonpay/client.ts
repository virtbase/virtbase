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

import type { AnonpayCreateInput, AnonpayCreateResponse } from "./types";

export class AnonpayClient {
  private readonly baseUrl = "https://trocador.app/anonpay";

  private async _request(url: string, options: RequestInit = {}) {
    const response = await fetch(this.baseUrl + url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(
        `[AnonpayClient] Failed to request ${url}: ${response.statusText}`,
      );
    }

    return response;
  }

  async create(input: AnonpayCreateInput) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        params.set(key, value.toString());
      }
    }

    const response = await this._request(`/?${params.toString()}`, {
      method: "GET",
    });
    return response.json() as Promise<AnonpayCreateResponse>;
  }
}

export const anonpay = new AnonpayClient();
