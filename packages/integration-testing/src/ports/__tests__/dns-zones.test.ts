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

import { describe, expect, test } from "bun:test";
import type { DnsZoneProvider, ZoneRecord } from "@virtbase/ports";
import { PortError } from "@virtbase/ports";
import { describeDnsZoneProvider, runDnsZonesContract } from "../dns-zones";

interface Defects {
  /** Lists no zone. */
  listsNoZones?: boolean;
  /** Treats `example.test.` and `example.test` as two zones. */
  keepsTrailingDot?: boolean;
  /** Recreates an existing zone empty. */
  wipesOnEnsure?: boolean;
  /** Leaves TXT records out of the export. */
  dropsTxtOnExport?: boolean;
  /** Leaves the SOA record out of the export. */
  hidesSoa?: boolean;
  /** Adds a record again although the same one exists. */
  duplicatesRecords?: boolean;
  /**
   * Replaces the records of the same name and type that existed before the
   * call, as a provider that writes a whole record set per call.
   */
  replacesByType?: boolean;
  /** Stores and matches record names exactly as given. */
  keepsRecordNameCase?: boolean;
  /** Deletes every record at the name, whatever its type. */
  ignoresTypeOnDelete?: boolean;
  /** Deletes every record at the name and type, whatever its content. */
  ignoresContentOnDelete?: boolean;
  /** Rejects a delete whose name holds no records. */
  rejectsAbsentDelete?: boolean;
  /** Creates a zone a record call names, instead of rejecting it. */
  createsMissingZone?: boolean;
}

/** An in-memory provider that keeps the contract, unless told otherwise. */
const referenceProvider = async (defects: Defects = {}) => {
  const zones = new Map<string, ZoneRecord[]>();
  const normalise = (name: string) => name.toLowerCase().replace(/\.$/, "");
  const zoneName = (domain: string) =>
    defects.keepsTrailingDot ? domain : normalise(domain);
  const recordName = (name: string) =>
    defects.keepsRecordNameCase ? name : normalise(name);
  const recordsOf = (zone: string) => {
    const records = zones.get(zoneName(zone));
    if (records) return records;
    if (defects.createsMissingZone) return [];
    throw new PortError(`no zone ${zone}`, {
      port: "dnsZones",
      integrationId: "reference",
    });
  };
  const same = (a: ZoneRecord, b: ZoneRecord) =>
    a.name === b.name && a.type === b.type && a.content === b.content;

  const provider: DnsZoneProvider = {
    listZones: async () =>
      defects.listsNoZones ? [] : [...zones.keys()].map((name) => ({ name })),
    ensureZone: async (domain) => {
      const name = zoneName(domain);
      if (defects.wipesOnEnsure || !zones.has(name)) {
        zones.set(name, [
          { name, type: "SOA", content: `ns1.${name}. hostmaster.${name}. 1` },
        ]);
      }
      return { name };
    },
    upsertRecords: async ({ zone, records }) => {
      const before = recordsOf(zone);
      let current = before;
      for (const given of records) {
        const record = { ...given, name: recordName(given.name) };
        if (defects.replacesByType) {
          current = current.filter(
            (other) =>
              !before.includes(other) ||
              other.name !== record.name ||
              other.type !== record.type,
          );
        }
        if (
          defects.duplicatesRecords ||
          !current.some((other) => same(other, record))
        ) {
          current = [...current, record];
        }
      }
      zones.set(zoneName(zone), current);
    },
    deleteRecords: async ({ zone, filter }) => {
      const current = recordsOf(zone);
      const name = recordName(filter.name);
      if (
        defects.rejectsAbsentDelete &&
        !current.some((record) => record.name === name)
      ) {
        throw new Error(`no records at ${filter.name}`);
      }
      const matches = (record: ZoneRecord) =>
        record.name === name &&
        (defects.ignoresTypeOnDelete ||
          filter.type === undefined ||
          record.type === filter.type) &&
        (defects.ignoresContentOnDelete ||
          filter.content === undefined ||
          record.content === filter.content);
      zones.set(
        zoneName(zone),
        current.filter((record) => !matches(record)),
      );
    },
    exportZone: async (zone) =>
      recordsOf(zone).filter(
        (record) =>
          !(defects.dropsTxtOnExport && record.type === "TXT") &&
          !(defects.hidesSoa && record.type === "SOA"),
      ),
  };
  return { provider };
};

const failedTitles = async (defects: Defects) =>
  (await runDnsZonesContract(() => referenceProvider(defects))).map((failure) =>
    failure.slice(0, failure.indexOf(":")),
  );

describeDnsZoneProvider("the reference provider", () => referenceProvider());

describe("runDnsZonesContract", () => {
  const cases: [string, Defects, string][] = [
    [
      "lists no zone",
      { listsNoZones: true },
      "ensureZone() creates a zone that listZones() lists",
    ],
    [
      "treats a trailing dot as another zone",
      { keepsTrailingDot: true },
      "a domain's case and trailing dot do not change the zone it names",
    ],
    [
      "empties an existing zone on ensureZone()",
      { wipesOnEnsure: true },
      "ensureZone() on an existing zone keeps its records",
    ],
    [
      "leaves TXT records out of the export",
      { dropsTxtOnExport: true },
      "exportZone() returns the records upsertRecords() wrote",
    ],
    [
      "leaves the SOA record out of the export",
      { hidesSoa: true },
      "exportZone() includes the SOA record of a new zone",
    ],
    [
      "adds a record it already holds",
      { duplicatesRecords: true },
      "upsertRecords() twice leaves one record per name, type and content",
    ],
    [
      "replaces records of the same name and type",
      { replacesByType: true },
      "upsertRecords() keeps a record of the same name and type with other content",
    ],
    [
      "matches record names by case and trailing dot",
      { keepsRecordNameCase: true },
      "a record name's case and trailing dot do not change the records it names",
    ],
    [
      "deletes every type at a name",
      { ignoresTypeOnDelete: true },
      "deleteRecords() by name and type removes those records and keeps the others",
    ],
    [
      "deletes every content at a name and type",
      { ignoresContentOnDelete: true },
      "deleteRecords() with content removes only a record holding it",
    ],
    [
      "rejects deleting records that do not exist",
      { rejectsAbsentDelete: true },
      "deleting records that do not exist succeeds",
    ],
    [
      "creates a zone a record call names",
      { createsMissingZone: true },
      "upsertRecords(), deleteRecords() and exportZone() reject a zone that does not exist with a PortError of the dnsZones port",
    ],
  ];

  for (const [defect, defects, title] of cases) {
    test(`fails a provider that ${defect}`, async () => {
      expect(await failedTitles(defects)).toEqual([title]);
    });
  }
});
