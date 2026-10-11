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
import type { DnsProvider } from "@virtbase/ports";
import type { Check } from "../checks/run";
import { describeChecks, runChecks } from "../checks/run";

/** A PTR record as the fake provider stores it. */
export interface PointerRecord {
  /** The record's name; a trailing dot and case are ignored. */
  name: string;
  /** The hostname it points to; a trailing dot and case are ignored. */
  content: string;
}

/** What the DNS contract suite needs from an integration's tests. */
export interface DnsContractSetup {
  /** The adapter under test, talking to a fresh fake provider. */
  provider: DnsProvider;
  /** Every PTR record the fake provider holds in `zone`. */
  records(zone: string): Promise<PointerRecord[]>;
}

const IPV4_ZONE = "2.0.10.in-addr.arpa";
const IPV6_ZONE = "8.b.d.0.1.0.0.2.ip6.arpa";

const normalise = (value: string) => value.toLowerCase().replace(/\.$/, "");

/** Records in a zone, normalised and sorted by name. */
type ReadRecords = (zone: string) => Promise<PointerRecord[]>;

/** One property of the contract: a title, and a run against a fresh adapter. */
interface DnsCheck {
  title: string;
  run(provider: DnsProvider, records: ReadRecords): Promise<void>;
}

const DNS_CHECKS: DnsCheck[] = [
  {
    title: "upsert names the record after the IPv4 address",
    run: async (provider, records) => {
      await provider.upsertPointerRecord({
        zone: IPV4_ZONE,
        ip: "10.0.2.7",
        hostname: "host.example",
      });
      expect(await records(IPV4_ZONE)).toEqual([
        { name: "7.2.0.10.in-addr.arpa", content: "host.example" },
      ]);
    },
  },
  {
    title: "upsert names the record after the IPv6 address's nibbles",
    run: async (provider, records) => {
      await provider.upsertPointerRecord({
        zone: IPV6_ZONE,
        ip: "2001:db8::1",
        hostname: "six.example",
      });
      expect(await records(IPV6_ZONE)).toEqual([
        {
          name: "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa",
          content: "six.example",
        },
      ]);
    },
  },
  {
    title: "upsert twice leaves one record",
    run: async (provider, records) => {
      const input = {
        zone: IPV4_ZONE,
        ip: "10.0.2.7",
        hostname: "host.example",
      };
      await provider.upsertPointerRecord(input);
      await provider.upsertPointerRecord(input);
      expect(await records(IPV4_ZONE)).toHaveLength(1);
    },
  },
  {
    title: "upsert replaces the hostname of an existing record",
    run: async (provider, records) => {
      await provider.upsertPointerRecord({
        zone: IPV4_ZONE,
        ip: "10.0.2.7",
        hostname: "old.example",
      });
      await provider.upsertPointerRecord({
        zone: IPV4_ZONE,
        ip: "10.0.2.7",
        hostname: "new.example",
      });
      expect(await records(IPV4_ZONE)).toEqual([
        { name: "7.2.0.10.in-addr.arpa", content: "new.example" },
      ]);
    },
  },
  {
    title: "a zone with a trailing dot is the same zone",
    run: async (provider, records) => {
      await provider.upsertPointerRecord({
        zone: `${IPV4_ZONE}.`,
        ip: "10.0.2.7",
        hostname: "host.example",
      });
      expect(await records(IPV4_ZONE)).toEqual([
        { name: "7.2.0.10.in-addr.arpa", content: "host.example" },
      ]);
    },
  },
  {
    title: "delete removes the listed records and keeps the others",
    run: async (provider, records) => {
      for (const ip of ["10.0.2.7", "10.0.2.8", "10.0.2.9"]) {
        await provider.upsertPointerRecord({
          zone: IPV4_ZONE,
          ip,
          hostname: `h${ip.split(".").at(-1)}.example`,
        });
      }
      await provider.deletePointerRecords({
        zone: IPV4_ZONE,
        ips: ["10.0.2.7", "10.0.2.9"],
      });
      expect(await records(IPV4_ZONE)).toEqual([
        { name: "8.2.0.10.in-addr.arpa", content: "h8.example" },
      ]);
    },
  },
  {
    title: "delete accepts a zone with a trailing dot",
    run: async (provider, records) => {
      await provider.upsertPointerRecord({
        zone: IPV4_ZONE,
        ip: "10.0.2.7",
        hostname: "host.example",
      });
      await provider.deletePointerRecords({
        zone: `${IPV4_ZONE}.`,
        ips: ["10.0.2.7"],
      });
      expect(await records(IPV4_ZONE)).toEqual([]);
    },
  },
  {
    title: "delete removes an IPv6 record",
    run: async (provider, records) => {
      await provider.upsertPointerRecord({
        zone: IPV6_ZONE,
        ip: "2001:db8::1",
        hostname: "six.example",
      });
      await provider.deletePointerRecords({
        zone: IPV6_ZONE,
        ips: ["2001:db8::1"],
      });
      expect(await records(IPV6_ZONE)).toEqual([]);
    },
  },
  {
    title: "deleting records that do not exist succeeds",
    run: async (provider, records) => {
      await provider.deletePointerRecords({
        zone: IPV4_ZONE,
        ips: ["10.0.2.200"],
      });
      expect(await records(IPV4_ZONE)).toEqual([]);
    },
  },
];

interface DnsContext {
  provider: DnsProvider;
  records: ReadRecords;
}

const toChecks = (): Check<DnsContext>[] =>
  DNS_CHECKS.map((check) => ({
    title: check.title,
    run: ({ provider, records }) => check.run(provider, records),
  }));

const contextFrom = async (
  setup: () => Promise<DnsContractSetup>,
): Promise<DnsContext> => {
  const { provider, records } = await setup();
  return {
    provider,
    records: async (zone) =>
      (await records(zone))
        .map((record) => ({
          name: normalise(record.name),
          content: normalise(record.content),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
  };
};

/**
 * The `dns` port contract (§4.8 of integration-first.md): every adapter that
 * provides `dns` runs it against its own fake provider. `setup` runs before
 * each check and must return an adapter on an empty provider.
 *
 * It proves the promises of `DnsProvider`: the record name is derived from the
 * IP (IPv4 and IPv6); an upsert is idempotent and replaces the hostname; a
 * zone with or without its trailing dot is the same zone, for upserts and
 * deletes; and deleting removes only the listed records and succeeds for
 * records that do not exist.
 */
export const describeDnsProvider = (
  name: string,
  setup: () => Promise<DnsContractSetup>,
): void =>
  describeChecks(`${name} provides dns`, toChecks(), () => contextFrom(setup));

/** Runs the `dns` contract and returns one line per failed check, for the suite's own tests. */
export const runDnsContract = (
  setup: () => Promise<DnsContractSetup>,
): Promise<string[]> => runChecks(toChecks(), () => contextFrom(setup));
