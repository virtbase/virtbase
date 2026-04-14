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

export class PowerDNSClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  async _request(url: string, options: RequestInit = {}) {
    const response = await fetch(this.apiUrl + url, {
      ...options,
      headers: {
        ...options.headers,
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
    });
    if (!response.ok) {
      throw new Error(
        `[PowerDNSClient] Failed to request ${url}: ${response.statusText}`,
      );
    }

    return response;
  }

  async upsertReverseDNSRecord({
    zone,
    name,
    hostname,
  }: {
    zone: string;
    name: string;
    hostname: string;
  }) {
    const normalizedZone = zone.endsWith(".") ? zone : `${zone}.`;
    return this._request(
      `/api/v1/servers/localhost/zones/${encodeURIComponent(normalizedZone)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          rrsets: [
            {
              name: `${name}.`,
              type: "PTR",
              ttl: 3600,
              changetype: "REPLACE",
              records: [
                {
                  content: `${hostname}.`,
                  disabled: false,
                },
              ],
            },
          ],
        }),
      },
    );
  }

  async deleteReverseDNSRecord({
    zone,
    name,
  }: {
    zone: string;
    name: string | string[];
  }) {
    const normalizedZone = zone.endsWith(".") ? zone : `${zone}.`;
    return this._request(
      `/api/v1/servers/localhost/zones/${encodeURIComponent(normalizedZone)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          rrsets: !Array.isArray(name)
            ? [
                {
                  name: `${name}.`,
                  type: "PTR",
                  changetype: "DELETE",
                },
              ]
            : name.map((entry) => ({
                name: `${entry}.`,
                type: "PTR",
                changetype: "DELETE",
              })),
        }),
      },
    );
  }
}

export const powerdns =
  process.env.POWERDNS_API_URL && process.env.POWERDNS_API_KEY
    ? new PowerDNSClient({
        apiUrl: process.env.POWERDNS_API_URL,
        apiKey: process.env.POWERDNS_API_KEY,
      })
    : null;
