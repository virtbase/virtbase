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

import { isIntegrationError } from "@virtbase/integration-sdk";
import type {
  DeletePointerRecordsInput,
  DnsProvider,
  UpsertPointerRecordInput,
} from "@virtbase/ports";
import { PortError } from "@virtbase/ports";
import type { PowerDNSClient } from "./client";
import { buildPtrName } from "./utils";

/**
 * Maps the {@link DnsProvider} port onto PowerDNS's zone API. The adapter
 * derives the record name from the IP, and translates every failure into a
 * {@link PortError} for callers (ADR 0003), retryable when the underlying
 * `IntegrationError` is.
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
      throw this.toPortError(error, `Failed to upsert PTR record for ${ip}`);
    }
  }

  async deletePointerRecords({
    zone,
    ips,
  }: DeletePointerRecordsInput): Promise<void> {
    if (ips.length === 0) return;

    try {
      await this.client.deleteReverseDNSRecords({
        zone,
        names: ips.map((ip) => buildPtrName(ip, zone)),
      });
    } catch (error) {
      throw this.toPortError(error, `Failed to delete PTR records in ${zone}`);
    }
  }

  private toPortError(error: unknown, message: string): PortError {
    return new PortError(message, {
      port: "dns",
      integrationId: "powerdns",
      retryable: isIntegrationError(error) && error.retryable,
      cause: error,
    });
  }
}
