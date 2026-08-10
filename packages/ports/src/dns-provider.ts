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

export interface UpsertPointerRecordInput {
  /** Reverse zone the record lives in, with or without the trailing dot. */
  zone: string;
  /** The IP the PTR record is for. The adapter derives the record name. */
  ip: string;
  /** Fully-qualified hostname the IP should resolve to. */
  hostname: string;
}

export interface DeletePointerRecordsInput {
  /** Reverse zone the records live in, with or without the trailing dot. */
  zone: string;
  /**
   * One or more IPs whose PTR records should be removed. Callers pass the whole
   * batch for a zone rather than looping, so adapters can collapse it into a
   * single provider request.
   */
  ips: string[];
}

/**
 * Reverse DNS management. Consumed by the rDNS router and by server deletion.
 *
 * The port speaks IPs rather than PTR record names: turning `1.2.3.4` into
 * `4.3.2.1.in-addr.arpa` is provider-adjacent detail that belongs in the
 * adapter, not in the routers that call it.
 */
export interface DnsProvider {
  upsertPointerRecord(input: UpsertPointerRecordInput): Promise<void>;
  deletePointerRecords(input: DeletePointerRecordsInput): Promise<void>;
}
