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
import { repairFirewallRule } from "../repair-firewall-rule";

describe("repairFirewallRule", () => {
  test("it drops an ICMP type from a TCP rule", () => {
    // The single most common mistake, and harmless to fix: the firewall would
    // have ignored the field anyway.
    expect(
      repairFirewallRule({
        proto: "tcp",
        dport: "443",
        icmp_type: "echo-request",
      }),
    ).toMatchObject({ proto: "tcp", dport: "443", icmp_type: undefined });
  });

  test("it drops ports from a protocol that has none", () => {
    expect(
      repairFirewallRule({
        proto: "icmp",
        icmp_type: "any",
        dport: "22",
        sport: "1024",
      }),
    ).toMatchObject({
      proto: "icmp",
      icmp_type: "any",
      dport: undefined,
      sport: undefined,
    });
  });

  test("it keeps ports on protocols that support them", () => {
    for (const proto of ["tcp", "udp", "sctp", "dccp", "udplite"]) {
      expect(repairFirewallRule({ proto, dport: "8080" })).toMatchObject({
        proto,
        dport: "8080",
      });
    }
  });

  test("it keeps an ICMP type on both ICMP protocols", () => {
    expect(
      repairFirewallRule({ proto: "ipv6-icmp", icmp_type: "echo-request" }),
    ).toMatchObject({ icmp_type: "echo-request" });
    expect(
      repairFirewallRule({ proto: "icmp", icmp_type: "any" }),
    ).toMatchObject({ icmp_type: "any" });
  });

  test("it treats empty strings and nulls as absent", () => {
    expect(
      repairFirewallRule({ proto: "", sport: "", dport: null, source: "" }),
    ).toMatchObject({
      proto: undefined,
      sport: undefined,
      dport: undefined,
      source: undefined,
    });
  });

  test("it tidies a spaced port list", () => {
    expect(
      repairFirewallRule({ proto: "tcp", dport: "80, 443 ,8080" }),
    ).toMatchObject({ dport: "80,443,8080" });
  });

  test("it lowercases the protocol", () => {
    expect(repairFirewallRule({ proto: "TCP", dport: "80" })).toMatchObject({
      proto: "tcp",
      dport: "80",
    });
  });

  test("it does not invent a missing protocol", () => {
    // Guessing tcp here would silently change what the customer asked for -
    // "block port 53" is far more likely to mean udp. Better to fail and retry.
    expect(repairFirewallRule({ dport: "53" })).toMatchObject({
      proto: undefined,
      dport: "53",
    });
  });

  test("it leaves the rest of the rule untouched", () => {
    const rule = {
      direction: "in" as const,
      action: "ACCEPT" as const,
      proto: "tcp",
      dport: "443",
      comment: "Allow HTTPS",
    };

    expect(repairFirewallRule(rule)).toMatchObject(rule);
  });

  test("it does not mutate its input", () => {
    const rule = { proto: "tcp", icmp_type: "any" };
    repairFirewallRule(rule);

    expect(rule.icmp_type).toBe("any");
  });
});
