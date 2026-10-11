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
import { describeDnsZoneProvider, runDnsZonesContract } from "../dns-zones";

interface Defects {
  /** Treats `example.test.` and `example.test` as two zones. */
  keepsTrailingDot?: boolean;
  /** Recreates an existing zone empty. */
  wipesOnEnsure?: boolean;
  /** Adds a record again although the same one exists. */
  duplicatesRecords?: boolean;
  /** Replaces every record of the same name and type. */
  replacesByType?: boolean;
  /** Deletes every record at the name, whatever its type. */
  ignoresTypeOnDelete?: boolean;
  /** Rejects a delete whose name holds no records. */
  rejectsAbsentDelete?: boolean;
}

/** An in-memory provider that keeps the contract, unless told otherwise. */
const referenceProvider = async (defects: Defects = {}) => {
  const zones = new Map<string, ZoneRecord[]>();
  const zoneName = (domain: string) =>
    defects.keepsTrailingDot ? domain : domain.toLowerCase().replace(/\.$/, "");
  const recordsOf = (zone: string) => zones.get(zoneName(zone)) ?? [];
  const same = (a: ZoneRecord, b: ZoneRecord) =>
    a.name === b.name && a.type === b.type && a.content === b.content;

  const provider: DnsZoneProvider = {
    listZones: async () => [...zones.keys()].map((name) => ({ name })),
    ensureZone: async (domain) => {
      const name = zoneName(domain);
      if (defects.wipesOnEnsure || !zones.has(name)) {
        zones.set(name, [
          { name, type: "SOA", content: `ns1.${name}. hostmaster.${name}. 1` },
        ]);
      }
      return { name };
    },
    upsertRecords: async (zone, records) => {
      let current = recordsOf(zone);
      for (const record of records) {
        if (defects.replacesByType) {
          current = current.filter(
            (other) => other.name !== record.name || other.type !== record.type,
          );
        }
        if (
          defects.duplicatesRecords ||
          !current.some((r) => same(r, record))
        ) {
          current = [...current, record];
        }
      }
      zones.set(zoneName(zone), current);
    },
    deleteRecords: async (zone, filter) => {
      const current = recordsOf(zone);
      if (
        defects.rejectsAbsentDelete &&
        !current.some((record) => record.name === filter.name)
      ) {
        throw new Error(`no records at ${filter.name}`);
      }
      const matches = (record: ZoneRecord) =>
        record.name === filter.name &&
        (defects.ignoresTypeOnDelete ||
          filter.type === undefined ||
          record.type === filter.type) &&
        (filter.content === undefined || record.content === filter.content);
      zones.set(
        zoneName(zone),
        current.filter((record) => !matches(record)),
      );
    },
    exportZone: async (zone) => recordsOf(zone),
  };
  return { provider };
};

const failedTitles = async (defects: Defects) =>
  (await runDnsZonesContract(() => referenceProvider(defects))).map((failure) =>
    failure.slice(0, failure.indexOf(":")),
  );

describeDnsZoneProvider("the reference provider", () => referenceProvider());

describe("runDnsZonesContract", () => {
  test("fails a provider that treats a trailing dot as another zone", async () => {
    expect(await failedTitles({ keepsTrailingDot: true })).toEqual([
      "a domain's case and trailing dot do not change the zone it names",
    ]);
  });

  test("fails a provider that empties an existing zone on ensureZone()", async () => {
    expect(await failedTitles({ wipesOnEnsure: true })).toEqual([
      "ensureZone() on an existing zone keeps the zone and its records",
    ]);
  });

  test("fails a provider that adds a record it already holds", async () => {
    expect(await failedTitles({ duplicatesRecords: true })).toEqual([
      "upsertRecords() twice leaves one record per name, type and content",
    ]);
  });

  test("fails a provider that replaces records of the same name and type", async () => {
    expect(await failedTitles({ replacesByType: true })).toEqual([
      "upsertRecords() keeps a record of the same name and type with other content",
    ]);
  });

  test("fails a provider that deletes every type at a name", async () => {
    expect(await failedTitles({ ignoresTypeOnDelete: true })).toEqual([
      "deleteRecords() by name and type removes those records and keeps the others",
    ]);
  });

  test("fails a provider that rejects deleting records that do not exist", async () => {
    expect(await failedTitles({ rejectsAbsentDelete: true })).toEqual([
      "deleting records that do not exist succeeds",
    ]);
  });
});
