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
import { parseIptablesSave } from "../parse-iptables";
import type { GuestFirewallRule } from "../types";
import { IPTABLES_EMPTY, IPTABLES_SAVE } from "./fixtures";

const byPort = (
  rules: GuestFirewallRule[],
  dport: string,
): GuestFirewallRule | undefined => rules.find((rule) => rule.dport === dport);

describe("parseIptablesSave", () => {
  test("it reads the built-in chain policies", () => {
    const state = parseIptablesSave(IPTABLES_SAVE);

    expect(state.manager).toBe("iptables");
    expect(state.active).toBe(true);
    expect(state.defaultPolicy).toEqual({
      incoming: "DROP",
      outgoing: "ACCEPT",
    });
  });

  test("it ignores tables other than filter", () => {
    // The nat rule in the fixture would otherwise look like a filtering rule.
    const state = parseIptablesSave(IPTABLES_SAVE);

    expect(state.rules.some((rule) => rule.chain === "POSTROUTING")).toBe(
      false,
    );
    expect(state.rules.some((rule) => rule.raw.includes("MASQUERADE"))).toBe(
      false,
    );
  });

  test("it derives the direction from the chain", () => {
    const state = parseIptablesSave(IPTABLES_SAVE);

    expect(byPort(state.rules, "22")?.direction).toBe("in");
    expect(byPort(state.rules, "25")?.direction).toBe("out");
    // Forwarded traffic is neither inbound nor outbound for this host.
    expect(
      state.rules.find((rule) => rule.chain === "FORWARD")?.direction,
    ).toBeNull();
  });

  test("it parses a simple port rule with its comment", () => {
    const state = parseIptablesSave(IPTABLES_SAVE);

    expect(byPort(state.rules, "22")).toMatchObject({
      action: "ACCEPT",
      proto: "tcp",
      dport: "22",
      comment: "allow ssh",
    });
  });

  test("it keeps a multiport list as written", () => {
    const state = parseIptablesSave(IPTABLES_SAVE);

    expect(byPort(state.rules, "80,443")).toMatchObject({
      action: "ACCEPT",
      proto: "tcp",
    });
  });

  test("it records the interface a rule is scoped to", () => {
    // `-i lo -j ACCEPT` accepts everything, but exposes nothing.
    const state = parseIptablesSave(IPTABLES_SAVE);
    const loopback = state.rules.find((rule) => rule.iface === "lo");

    expect(loopback).toMatchObject({ action: "ACCEPT", direction: "in" });
  });

  test("it reads a source CIDR", () => {
    const state = parseIptablesSave(IPTABLES_SAVE);

    expect(byPort(state.rules, "5432")).toMatchObject({
      sourceAddr: "10.0.0.0/8",
      action: "ACCEPT",
    });
  });

  test("it keeps a negation in the captured value", () => {
    // "everything except this network" must never read as "this network".
    const state = parseIptablesSave(IPTABLES_SAVE);

    expect(byPort(state.rules, "8086")).toMatchObject({
      sourceAddr: "!192.168.0.0/16",
      action: "DROP",
    });
  });

  test("it gives a non-verdict target a null action but keeps the rule", () => {
    const state = parseIptablesSave(IPTABLES_SAVE);
    const log = state.rules.find((rule) => rule.raw.includes("-j LOG"));

    expect(log).toBeDefined();
    expect(log?.action).toBeNull();

    const jump = state.rules.find((rule) => rule.raw.includes("-j DOCKER"));

    expect(jump?.action).toBeNull();
  });

  test("it does not mistake a target option for a match", () => {
    // `--reject-with icmp-port-unreachable` follows `-j REJECT`.
    const state = parseIptablesSave(IPTABLES_SAVE);

    expect(byPort(state.rules, "25")).toMatchObject({
      action: "REJECT",
      proto: "tcp",
      direction: "out",
    });
  });

  test("it numbers rules in the order they are evaluated", () => {
    const state = parseIptablesSave(IPTABLES_SAVE);

    expect(state.rules.map((rule) => rule.index)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  test("it keeps the original line for every rule", () => {
    const state = parseIptablesSave(IPTABLES_SAVE);

    for (const rule of state.rules) {
      expect(rule.raw.startsWith("-A")).toBe(true);
      expect(rule.manager).toBe("iptables");
    }
  });

  test("it treats a policy-only ruleset as active", () => {
    // iptables has no on/off switch - a readable ruleset means it is filtering,
    // even when nothing has been added to it.
    const state = parseIptablesSave(IPTABLES_EMPTY);

    expect(state.active).toBe(true);
    expect(state.rules).toEqual([]);
    expect(state.defaultPolicy).toEqual({
      incoming: "ACCEPT",
      outgoing: "ACCEPT",
    });
  });

  test("it handles empty output", () => {
    expect(parseIptablesSave("")).toEqual({
      manager: "iptables",
      active: false,
      defaultPolicy: null,
      rules: [],
    });
  });
});
