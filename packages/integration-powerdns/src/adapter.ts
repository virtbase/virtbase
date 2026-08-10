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
  DeletePointerRecordsInput,
  DnsProvider,
  UpsertPointerRecordInput,
} from "@virtbase/ports";
import { PortError } from "@virtbase/ports";
import type { PowerDNSClient } from "./client";
import { buildPtrName } from "./utils";

/**
 * Maps the {@link DnsProvider} port onto PowerDNS' zone API.
 *
 * Turning an IP into a PTR record name lives here rather than at the call
 * sites, which previously each imported `buildPtrName` alongside the client.
 */
export class PowerDnsAdapter implements DnsProvider {
  private readonly client: PowerDNSClient;

  constructor(client: PowerDNSClient) {
    this.client = client;
  }

  async upsertPointerRecord({
    zone,
    ip,
    hostname,
  }: UpsertPointerRecordInput): Promise<void> {
    try {
      await this.client.upsertReverseDNSRecord({
        zone,
        hostname,
        name: buildPtrName(ip, zone),
      });
    } catch (error) {
      throw this.wrap(error, `Failed to upsert PTR record for ${ip}`);
    }
  }

  async deletePointerRecords({
    zone,
    ips,
  }: DeletePointerRecordsInput): Promise<void> {
    if (0 === ips.length) return;

    try {
      await this.client.deleteReverseDNSRecord({
        zone,
        name: ips.map((ip) => buildPtrName(ip, zone)),
      });
    } catch (error) {
      throw this.wrap(error, `Failed to delete PTR records in ${zone}`);
    }
  }

  private wrap(error: unknown, message: string): PortError {
    return new PortError(message, {
      port: "dns",
      integrationId: "powerdns",
      // A zone mismatch is a caller bug and will fail again identically;
      // anything else is a transport or server error worth retrying.
      retryable: !(
        error instanceof Error && error.message.includes("reverse zone")
      ),
      cause: error,
    });
  }
}
