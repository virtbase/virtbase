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
import type { DnsProvider } from "@virtbase/ports";
import type { PointerRecord } from "../dns";
import { describeDnsProvider, runDnsContract } from "../dns";

const expandIpv6 = (ip: string): string[] => {
  const [left = "", right = ""] = ip.split("::");
  const head = left ? left.split(":") : [];
  const tail = right ? right.split(":") : [];
  const groups = [
    ...head,
    ...Array<string>(8 - head.length - tail.length).fill("0"),
    ...tail,
  ];
  return groups.flatMap((group) => group.padStart(4, "0").split(""));
};

const reverseName = (ip: string) =>
  ip.includes(":")
    ? `${expandIpv6(ip).reverse().join(".")}.ip6.arpa`
    : `${ip.split(".").reverse().join(".")}.in-addr.arpa`;

/**
 * A reference adapter: what the contract expects of any dns adapter.
 * `keepTrailingDot` breaks it the way a careless adapter would.
 */
const inMemoryDns = ({ keepTrailingDot = false } = {}) => {
  const zones = new Map<string, Map<string, string>>();
  const zoneOf = (zone: string) => {
    const key = keepTrailingDot ? zone : zone.replace(/\.$/, "");
    const records = zones.get(key) ?? new Map<string, string>();
    zones.set(key, records);
    return records;
  };
  const provider: DnsProvider = {
    upsertPointerRecord: async ({ zone, ip, hostname }) => {
      zoneOf(zone).set(reverseName(ip), hostname);
    },
    deletePointerRecords: async ({ zone, ips }) => {
      for (const ip of ips) zoneOf(zone).delete(reverseName(ip));
    },
  };
  const records = async (zone: string): Promise<PointerRecord[]> =>
    [...zoneOf(zone)].map(([name, content]) => ({ name, content }));
  return { provider, records };
};

describeDnsProvider("the reference adapter", async () => inMemoryDns());

describe("runDnsContract", () => {
  test("fails an adapter that treats a trailing dot as another zone", async () => {
    expect(
      (
        await runDnsContract(async () => inMemoryDns({ keepTrailingDot: true }))
      ).map((failure) => failure.slice(0, failure.indexOf(":"))),
    ).toEqual([
      "a zone with a trailing dot is the same zone",
      "delete accepts a zone with a trailing dot",
    ]);
  });
});
