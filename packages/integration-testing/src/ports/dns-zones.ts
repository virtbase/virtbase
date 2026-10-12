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
import { PortError } from "@virtbase/ports";
import type { Check } from "../checks/run";
import { describeChecks, runChecks } from "../checks/run";

/** What the `dnsZones` contract suite needs from an integration's tests. */
export interface DnsZonesContractSetup {
  /** The adapter under test, talking to a fresh fake provider with no zones. */
  provider: DnsZoneProvider;
}

const ZONE = "example.test";
const ABSENT_ZONE = "absent.test";

const APEX_A: ZoneRecord = { name: ZONE, type: "A", content: "192.0.2.10" };
const MAIL_A: ZoneRecord = {
  name: `mail.${ZONE}`,
  type: "A",
  content: "192.0.2.25",
};
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
 * its own to a zone, and the checks leave those out of every comparison but
 * the SOA check.
 */
const WRITTEN_TYPES = new Set(["A", "MX", "TXT"]);

/** A record or zone name lowercased and stripped of its trailing dot. */
const normaliseName = (name: string) => name.toLowerCase().replace(/\.$/, "");

const compareRecords = (a: ZoneRecord, b: ZoneRecord) =>
  `${a.name} ${a.type} ${a.content}`.localeCompare(
    `${b.name} ${b.type} ${b.content}`,
  );

/** The records of `zone` the checks wrote, with normalised names, sorted. */
const readWrittenRecords = async (
  provider: DnsZoneProvider,
  zone: string,
): Promise<ZoneRecord[]> =>
  (await provider.exportZone(zone))
    .filter((record) => WRITTEN_TYPES.has(record.type))
    .map((record) => ({
      name: normaliseName(record.name),
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
    title: "ensureZone() on an existing zone keeps its records",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords({ zone: ZONE, records: [APEX_A] });
      await provider.ensureZone(ZONE);
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
      await provider.upsertRecords({ zone: `${ZONE}.`, records: [APEX_A] });
      const otherZones = (await provider.listZones()).filter(
        ({ name }) => name !== ZONE,
      );
      expect(otherZones).toEqual([]);
      expect(await readWrittenRecords(provider, ZONE)).toEqual([APEX_A]);
    },
  },
  {
    title: "exportZone() returns the records upsertRecords() wrote",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords({
        zone: ZONE,
        records: [APEX_A, APEX_MX, APEX_SPF, DMARC],
      });
      expect(await readWrittenRecords(provider, ZONE)).toEqual(
        sortRecords([APEX_A, APEX_MX, APEX_SPF, DMARC]),
      );
    },
  },
  {
    title: "exportZone() includes the SOA record of a new zone",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      const soaNames = (await provider.exportZone(ZONE))
        .filter((record) => record.type === "SOA")
        .map((record) => normaliseName(record.name));
      expect(soaNames).toEqual([ZONE]);
    },
  },
  {
    title: "upsertRecords() twice leaves one record per name, type and content",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords({ zone: ZONE, records: [APEX_MX, MAIL_A] });
      await provider.upsertRecords({ zone: ZONE, records: [APEX_MX, MAIL_A] });
      expect(await readWrittenRecords(provider, ZONE)).toEqual(
        sortRecords([APEX_MX, MAIL_A]),
      );
    },
  },
  {
    title:
      "upsertRecords() keeps a record of the same name and type with other content",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords({ zone: ZONE, records: [APEX_MX] });
      await provider.upsertRecords({ zone: ZONE, records: [SECOND_MX] });
      expect(await readWrittenRecords(provider, ZONE)).toEqual(
        sortRecords([APEX_MX, SECOND_MX]),
      );
    },
  },
  {
    title:
      "a record name's case and trailing dot do not change the records it names",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords({
        zone: ZONE,
        records: [{ ...DMARC, name: `_DMARC.${ZONE}.` }],
      });
      await provider.deleteRecords({
        zone: ZONE,
        filter: { name: DMARC.name },
      });
      expect(await readWrittenRecords(provider, ZONE)).toEqual([]);
    },
  },
  {
    title:
      "deleteRecords() by name and type removes those records and keeps the others",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords({
        zone: ZONE,
        records: [APEX_A, APEX_MX, MAIL_A],
      });
      await provider.deleteRecords({
        zone: ZONE,
        filter: { name: ZONE, type: "MX" },
      });
      expect(await readWrittenRecords(provider, ZONE)).toEqual(
        sortRecords([APEX_A, MAIL_A]),
      );
    },
  },
  {
    title: "deleteRecords() with content removes only a record holding it",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.upsertRecords({
        zone: ZONE,
        records: [APEX_MX, SECOND_MX],
      });
      await provider.deleteRecords({
        zone: ZONE,
        filter: { name: ZONE, type: "MX", content: SECOND_MX.content },
      });
      expect(await readWrittenRecords(provider, ZONE)).toEqual([APEX_MX]);
    },
  },
  {
    title: "deleting records that do not exist succeeds",
    run: async ({ provider }) => {
      await provider.ensureZone(ZONE);
      await provider.deleteRecords({
        zone: ZONE,
        filter: { name: `absent.${ZONE}` },
      });
      expect(await readWrittenRecords(provider, ZONE)).toEqual([]);
    },
  },
  {
    title:
      "upsertRecords(), deleteRecords() and exportZone() reject a zone that does not exist with a PortError of the dnsZones port",
    run: async ({ provider }) => {
      const calls = [
        () =>
          provider.upsertRecords({
            zone: ABSENT_ZONE,
            records: [{ ...APEX_A, name: ABSENT_ZONE }],
          }),
        () =>
          provider.deleteRecords({
            zone: ABSENT_ZONE,
            filter: { name: ABSENT_ZONE },
          }),
        () => provider.exportZone(ABSENT_ZONE),
      ];
      for (const call of calls) {
        const error = await call().then(
          () => null,
          (rejection: unknown) => rejection,
        );
        expect(error).toBeInstanceOf(PortError);
        expect(error instanceof PortError ? error.port : null).toBe("dnsZones");
      }
    },
  },
];

/**
 * The `dnsZones` port contract (§4.8 of integration-first.md): every adapter
 * that provides `dnsZones` runs it against its own fake provider. `setup`
 * runs before each check and must return an adapter on a provider with no
 * zones.
 *
 * It proves the promises of `DnsZoneProvider`: `ensureZone` creates a listed
 * zone and keeps an existing zone's records; the case and trailing dot of a
 * domain or a record name change nothing; records round-trip through
 * `exportZone`, which includes the new zone's SOA record; `upsertRecords` is
 * idempotent per name, type and content, and keeps other content of the
 * same name and type; `deleteRecords` removes exactly what its filter matches
 * and succeeds when that is nothing; and a missing zone is rejected with a
 * `PortError` of the `dnsZones` port.
 */
export const describeDnsZoneProvider = (
  name: string,
  setup: () => Promise<DnsZonesContractSetup>,
): void => describeChecks(`${name} provides dnsZones`, DNS_ZONES_CHECKS, setup);

/** Runs the `dnsZones` contract and returns one line per failed check, for the suite's own tests. */
export const runDnsZonesContract = (
  setup: () => Promise<DnsZonesContractSetup>,
): Promise<string[]> => runChecks(DNS_ZONES_CHECKS, setup);
