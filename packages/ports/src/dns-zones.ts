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

/** A forward zone the provider serves. */
export interface DnsZone {
  /** The zone's domain, lowercase and without the trailing dot. */
  name: string;
}

/** One resource record of a forward zone. */
export interface ZoneRecord {
  /**
   * The record's owner name, fully qualified: `example.com` for the apex,
   * `_dmarc.example.com` below it. A trailing dot and case are ignored.
   */
  name: string;
  /** The record type's mnemonic, uppercase: `A`, `MX`, `TXT`. */
  type: string;
  /**
   * The record's data in zone-file presentation format (RFC 1035 §5.1): a TXT
   * value in double quotes, an MX as `<preference> <exchange>` with the
   * exchange fully qualified and dot-terminated.
   */
  content: string;
}

/**
 * Which records {@link DnsZoneProvider.deleteRecords} removes: every record
 * at `name`, narrowed to `type` and to `content` when they are given.
 */
export interface ZoneRecordFilter {
  /** Fully qualified, as {@link ZoneRecord.name}. */
  name: string;
  type?: string;
  content?: string;
}

/** The input of {@link DnsZoneProvider.upsertRecords}. */
export interface UpsertZoneRecordsInput {
  /** The zone's domain, as {@link DnsZoneProvider.ensureZone} takes it. */
  zone: string;
  records: readonly ZoneRecord[];
}

/** The input of {@link DnsZoneProvider.deleteRecords}. */
export interface DeleteZoneRecordsInput {
  /** The zone's domain, as {@link DnsZoneProvider.ensureZone} takes it. */
  zone: string;
  filter: ZoneRecordFilter;
}

/**
 * Forward DNS zones and their records, for the integrations that write DNS
 * for a service: a mail domain's MX, SPF, DKIM and DMARC records (§11.3 of
 * integration-first.md). Reverse DNS stays with the `dns` port.
 *
 * A zone is named by its domain, and neither the domain's case nor its
 * trailing dot changes the zone it names.
 *
 * `upsertRecords`, `deleteRecords` and `exportZone` must reject with a
 * `PortError` of the `dnsZones` port for a zone that does not exist, so a
 * caller must call `ensureZone` first.
 *
 * Every implementation must make `ensureZone` and `upsertRecords` idempotent,
 * and must let `deleteRecords` succeed for records that do not exist; the
 * `dnsZones` contract suite of `@virtbase/integration-testing` checks these
 * promises, the rejection for a missing zone, the case and trailing dot of
 * zone and record names, and the round trip through `exportZone`.
 */
export interface DnsZoneProvider {
  /** Every zone the provider serves under this installation's credentials. */
  listZones(): Promise<DnsZone[]>;
  /**
   * Creates the zone for `domain` unless it exists. An existing zone keeps
   * its records.
   */
  ensureZone(domain: string): Promise<DnsZone>;
  /**
   * Adds each record unless a record with the same name, type and content
   * exists. Records of the same name and type with other content stay, so a
   * second MX is added next to the first rather than replacing it.
   */
  upsertRecords(input: UpsertZoneRecordsInput): Promise<void>;
  /**
   * Removes the records `filter` matches. Succeeds when it matches none, so a
   * cleanup that is repeated, or runs after someone else removed the records,
   * does not fail.
   */
  deleteRecords(input: DeleteZoneRecordsInput): Promise<void>;
  /**
   * Every record of the zone. It must include the SOA record the provider
   * creates with the zone.
   */
  exportZone(zone: string): Promise<ZoneRecord[]>;
}
