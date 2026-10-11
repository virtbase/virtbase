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

import { expect } from "bun:test";
import type { DnsZoneProvider, ZoneRecord } from "@virtbase/ports";
import type { Check } from "../checks/run";
import { describeChecks, runChecks } from "../checks/run";

/** What the `dnsZones` contract suite needs from an integration's tests. */
export interface DnsZonesContractSetup {
  /** The adapter under test, talking to a fresh fake provider with no zones. */
  provider: DnsZoneProvider;
}

const ZONE = "example.test";

const APEX_A: ZoneRecord = { name: ZONE, type: "A", content: "192.0.2.10" };
const APEX_MX: ZoneRecord = {
  name: ZONE,
  type: "MX",
  content: "10 mx1.example.test.",
};
const SECOND_MX: ZoneRecord = {
  name: ZONE,
  type: "MX",
  content: "20 mx2.example.test.",
};
const APEX_SPF: ZoneRecord = {
  name: ZONE,
  type: "TXT",
  content: '"v=spf1 mx -all"',
};
const DMARC: ZoneRecord = {
  name: `_dmarc.${ZONE}`,
  type: "TXT",
  content: '"v=DMARC1; p=reject"',
};

/**
 * The record types the checks write. A provider adds SOA and NS records of
 * its own to a zone, and the checks leave those out of every comparison.
 */
const WRITTEN_TYPES = new Set(["A", "MX", "TXT"]);

const compareRecords = (a: ZoneRecord, b: ZoneRecord) =>
  `${a.name} ${a.type} ${a.content}`.localeCompare(
    `${b.name} ${b.type} ${b.content}`,
  );

/**
 * The records of `zone` the checks wrote, with names lowercased and stripped
 * of their trailing dot, sorted.
 */
const readWrittenRecords = async (
  provider: DnsZoneProvider,
  zone: string,
): Promise<ZoneRecord[]> =>
  (await provider.exportZone(zone))
    .filter((record) => WRITTEN_TYPES.has(record.type))
    .map((record) => ({
      name: record.name.toLowerCase().replace(/\.$/, ""),
      type: record.type,
      content: record.content,
    }))
    .sort(compareRecords);

const sortRecords = (records: ZoneRecord[]) =>
  [...records].sort(compareRecords);

const DNS_ZONES_CHECKS: Check<DnsZonesContractSetup>[] = [
  {
    title: "ensureZone() creates a zone that listZones() lists",
    run: async ({ provider }) => {
      expect(await provider.ensureZone(ZONE)).toEqual({ name: ZONE });
      expect(await provider.listZones()).toEqual([{ name: ZONE }]);
    },
  },
  {
    title: "ensureZone() on an existing zone keeps the zone and its records",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords(ZONE, [APEX_A]);
      await provider.ensureZone(ZONE);
      expect(await provider.listZones()).toEqual([{ name: ZONE }]);
      expect(await readWrittenRecords(provider, ZONE)).toEqual([APEX_A]);
    },
  },
  {
    title: "a domain's case and trailing dot do not change the zone it names",
    run: async ({ provider }) => {
      expect(await provider.ensureZone("Example.TEST.")).toEqual({
        name: ZONE,
      });
      await provider.ensureZone(ZONE);
      await provider.upsertRecords(`${ZONE}.`, [APEX_A]);
      expect(await provider.listZones()).toEqual([{ name: ZONE }]);
      expect(await readWrittenRecords(provider, ZONE)).toEqual([APEX_A]);
    },
  },
  {
    title: "exportZone() returns the records upsertRecords() wrote",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords(ZONE, [APEX_A, APEX_MX, APEX_SPF, DMARC]);
      expect(await readWrittenRecords(provider, ZONE)).toEqual(
        sortRecords([APEX_A, APEX_MX, APEX_SPF, DMARC]),
      );
    },
  },
  {
    title: "upsertRecords() twice leaves one record per name, type and content",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords(ZONE, [APEX_MX, DMARC]);
      await provider.upsertRecords(ZONE, [APEX_MX, DMARC]);
      expect(await readWrittenRecords(provider, ZONE)).toEqual(
        sortRecords([APEX_MX, DMARC]),
      );
    },
  },
  {
    title:
      "upsertRecords() keeps a record of the same name and type with other content",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords(ZONE, [APEX_MX]);
      await provider.upsertRecords(ZONE, [SECOND_MX]);
      expect(await readWrittenRecords(provider, ZONE)).toEqual(
        sortRecords([APEX_MX, SECOND_MX]),
      );
    },
  },
  {
    title:
      "deleteRecords() by name and type removes those records and keeps the others",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords(ZONE, [APEX_A, APEX_SPF, DMARC]);
      await provider.deleteRecords(ZONE, { name: ZONE, type: "TXT" });
      expect(await readWrittenRecords(provider, ZONE)).toEqual(
        sortRecords([APEX_A, DMARC]),
      );
    },
  },
  {
    title: "deleteRecords() with content removes only a record holding it",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords(ZONE, [APEX_MX]);
      await provider.deleteRecords(ZONE, {
        name: ZONE,
        type: "MX",
        content: SECOND_MX.content,
      });
      expect(await readWrittenRecords(provider, ZONE)).toEqual([APEX_MX]);
    },
  },
  {
    title: "deleting records that do not exist succeeds",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.deleteRecords(ZONE, { name: `absent.${ZONE}` });
      expect(await readWrittenRecords(provider, ZONE)).toEqual([]);
    },
  },
];

/**
 * The `dnsZones` port contract (§4.8 of integration-first.md): every adapter
 * that provides `dnsZones` runs it against its own fake provider. `setup`
 * runs before each check and must return an adapter on a provider with no
 * zones.
 *
 * It proves the promises of `DnsZoneProvider`: `ensureZone` is idempotent and
 * keeps an existing zone's records; a domain's case and trailing dot do not
 * change the zone; records round-trip through `exportZone`; `upsertRecords`
 * is idempotent per name, type and content, and keeps other content of the
 * same name and type; `deleteRecords` removes exactly what its filter matches
 * and succeeds when that is nothing.
 */
export const describeDnsZoneProvider = (
  name: string,
  setup: () => Promise<DnsZonesContractSetup>,
): void => describeChecks(`${name} provides dnsZones`, DNS_ZONES_CHECKS, setup);

/** Runs the `dnsZones` contract and returns one line per failed check, for the suite's own tests. */
export const runDnsZonesContract = (
  setup: () => Promise<DnsZonesContractSetup>,
): Promise<string[]> => runChecks(DNS_ZONES_CHECKS, setup);
