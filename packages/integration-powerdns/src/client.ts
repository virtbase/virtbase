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

const SERVER = "/api/v1/servers/localhost";

const ServerInfoSchema = z.object({
  id: z.string(),
  version: z.string().optional(),
});

/** A PTR change in PowerDNS's rrset format; a REPLACE always names its hostname. */
type PointerChange =
  | { changetype: "REPLACE"; name: string; hostname: string }
  | { changetype: "DELETE"; name: string };

/**
 * The health probe's request timeout, inside the registry's 5 s probe budget,
 * so a silent PowerDNS reports this request's timeout rather than the budget.
 */
const SERVER_INFO_TIMEOUT_MS = 4_000;

/**
 * PowerDNS's zone id for a zone name: every character other than a letter, a
 * digit, `.` or `-` becomes `=` and its two-digit hex code, so the RFC 2317
 * zone `0/25.1.168.192.in-addr.arpa.` is `0=2F25.1.168.192.in-addr.arpa.`.
 */
export const toZoneId = (zone: string): string =>
  zone.replace(
    /[^A-Za-z0-9.-]/g,
    (character) =>
      `=${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );

/**
 * The parts of the PowerDNS HTTP API this integration uses, over `ctx.http`
 * (INT-4). A response other than 2xx throws an {@link IntegrationError}
 * coded `powerdns.request_failed`, retryable for 429 and 5xx.
 */
export class PowerDNSClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly http: IntegrationHttp;

  constructor({
    apiUrl,
    apiKey,
    http,
  }: {
    apiUrl: string;
    apiKey: string;
    http: IntegrationHttp;
  }) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.http = http;
  }

  /** Creates or replaces the PTR record `name` in `zone`. */
  async upsertReverseDNSRecord({
    zone,
    name,
    hostname,
  }: {
    zone: string;
    name: string;
    hostname: string;
  }): Promise<void> {
    await this.patchZone(zone, [{ name, changetype: "REPLACE", hostname }]);
  }

  /** Deletes the PTR records `names` in `zone`; absent ones are no error. */
  async deleteReverseDNSRecords({
    zone,
    names,
  }: {
    zone: string;
    names: string[];
  }): Promise<void> {
    await this.patchZone(
      zone,
      names.map((name) => ({ name, changetype: "DELETE" })),
    );
  }

  /** The cheapest authenticated call PowerDNS offers; the health probe. */
  async getServerInfo(): Promise<z.output<typeof ServerInfoSchema>> {
    const response = await this.request(SERVER, {
      method: "GET",
      timeoutMs: SERVER_INFO_TIMEOUT_MS,
    });
    const parsed = ServerInfoSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new IntegrationError({
        code: "powerdns.unexpected_response",
        message: `GET ${SERVER} answered with a body that is not PowerDNS server info`,
      });
    }
    return parsed.data;
  }

  private patchZone(zone: string, changes: PointerChange[]) {
    const fqdn = zone.endsWith(".") ? zone : `${zone}.`;
    return this.request(
      `${SERVER}/zones/${encodeURIComponent(toZoneId(fqdn))}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          rrsets: changes.map((change) => ({
            name: `${change.name}.`,
            type: "PTR",
            changetype: change.changetype,
            ...(change.changetype === "REPLACE" && {
              ttl: 3600,
              records: [{ content: `${change.hostname}.`, disabled: false }],
            }),
          })),
        }),
      },
    );
  }

  private async request(
    path: string,
    init: RequestInit & { timeoutMs?: number },
  ): Promise<Response> {
    const response = await this.http.request(this.apiUrl + path, {
      ...init,
      headers: { "Content-Type": "application/json", "X-API-Key": this.apiKey },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new IntegrationError({
        code: "powerdns.request_failed",
        message: `${init.method} ${path} answered ${response.status} ${response.statusText}`,
        retryable: response.status === 429 || response.status >= 500,
        params: { status: response.status },
      });
    }
    return response;
  }
}
