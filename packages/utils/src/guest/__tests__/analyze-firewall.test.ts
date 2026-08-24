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
import type {
  GuestFirewallInput,
  HostFirewallRuleInput,
} from "../analyze-firewall";
import {
  analyzeFirewall,
  evaluateGuestReachability,
  evaluateHostReachability,
  matchesPortSpec,
} from "../analyze-firewall";
import type {
  GuestFirewallRule,
  ListeningSocket,
  SocketProtocol,
} from "../types";

const hostRule = (
  overrides: Partial<HostFirewallRuleInput> = {},
): HostFirewallRuleInput => ({
  pos: 0,
  enabled: true,
  direction: "in",
  action: "ACCEPT",
  proto: "tcp",
  dport: null,
  source: null,
  ...overrides,
});

const guestRule = (
  overrides: Partial<GuestFirewallRule> = {},
): GuestFirewallRule => ({
  manager: "ufw",
  index: 1,
  chain: null,
  direction: "in",
  action: "ACCEPT",
  proto: "tcp",
  dport: null,
  sport: null,
  sourceAddr: null,
  destAddr: null,
  iface: null,
  comment: null,
  raw: "raw",
  ...overrides,
});

const listener = (
  port: number,
  overrides: Partial<ListeningSocket> = {},
): ListeningSocket => ({
  protocol: "tcp" as SocketProtocol,
  address: "0.0.0.0",
  port,
  scope: "wildcard",
  family: "ipv4",
  processes: [],
  raw: `listener ${port}`,
  ...overrides,
});

const guest = (
  overrides: Partial<GuestFirewallInput> = {},
): GuestFirewallInput => ({
  active: true,
  readable: true,
  manager: "ufw",
  defaultPolicy: { incoming: "DROP", outgoing: "ACCEPT" },
  rules: [],
  ...overrides,
});

const codes = (findings: { code: string }[]) => findings.map((f) => f.code);

describe("matchesPortSpec", () => {
  const cases: [string | null, number, boolean][] = [
    [null, 22, true],
    ["22", 22, true],
    ["22", 23, false],
    ["80,443", 443, true],
    ["80,443", 8080, false],
    ["8000:8100", 8050, true],
    ["8000:8100", 8101, false],
    ["8000-8100", 8000, true],
    ["80, 443", 443, true],
  ];

  for (const [spec, port, expected] of cases) {
    test(`${spec ?? "any"} covers ${port}: ${expected}`, () => {
      expect(matchesPortSpec(spec, port)).toBe(expected);
    });
  }
});

describe("evaluateHostReachability", () => {
  test("it falls back to the default policy when no rule matches", () => {
    expect(
      evaluateHostReachability([], "DROP", { port: 22, proto: "tcp" }),
    ).toBe("DROP");
  });

  test("it reports unknown rather than guessing a missing policy", () => {
    // Assuming ACCEPT invents warnings; assuming DROP hides real ones.
    expect(evaluateHostReachability([], null, { port: 22, proto: "tcp" })).toBe(
      "unknown",
    );
  });

  test("it stops at the first matching rule", () => {
    const rules = [
      hostRule({ pos: 0, action: "DROP", dport: "22" }),
      hostRule({ pos: 1, action: "ACCEPT", dport: "22" }),
    ];

    expect(
      evaluateHostReachability(rules, "ACCEPT", { port: 22, proto: "tcp" }),
    ).toBe("DROP");
  });

  test("it evaluates in position order, not array order", () => {
    const rules = [
      hostRule({ pos: 5, action: "ACCEPT", dport: "22" }),
      hostRule({ pos: 1, action: "DROP", dport: "22" }),
    ];

    expect(
      evaluateHostReachability(rules, "ACCEPT", { port: 22, proto: "tcp" }),
    ).toBe("DROP");
  });

  test("it ignores disabled rules", () => {
    const rules = [hostRule({ enabled: false, action: "DROP", dport: "22" })];

    expect(
      evaluateHostReachability(rules, "ACCEPT", { port: 22, proto: "tcp" }),
    ).toBe("ACCEPT");
  });

  test("it ignores outbound rules", () => {
    const rules = [hostRule({ direction: "out", action: "DROP", dport: "22" })];

    expect(
      evaluateHostReachability(rules, "ACCEPT", { port: 22, proto: "tcp" }),
    ).toBe("ACCEPT");
  });

  test("it does not let a rule scoped to one network decide for the internet", () => {
    // "ACCEPT 3306 from 10.0.0.0/8" must not read as "3306 open to everyone",
    // which would be a false critical on a perfectly safe server.
    const rules = [
      hostRule({ action: "ACCEPT", dport: "3306", source: "10.0.0.0/8" }),
    ];

    expect(
      evaluateHostReachability(rules, "DROP", { port: 3306, proto: "tcp" }),
    ).toBe("DROP");
  });

  test("it treats an explicit any-source as unrestricted", () => {
    const rules = [
      hostRule({ action: "ACCEPT", dport: "22", source: "0.0.0.0/0" }),
    ];

    expect(
      evaluateHostReachability(rules, "DROP", { port: 22, proto: "tcp" }),
    ).toBe("ACCEPT");
  });

  test("it respects the protocol", () => {
    const rules = [hostRule({ action: "DROP", proto: "udp", dport: "53" })];

    expect(
      evaluateHostReachability(rules, "ACCEPT", { port: 53, proto: "tcp" }),
    ).toBe("ACCEPT");
    expect(
      evaluateHostReachability(rules, "ACCEPT", { port: 53, proto: "udp" }),
    ).toBe("DROP");
  });

  test("a rule without a protocol or port covers everything", () => {
    const rules = [hostRule({ action: "DROP", proto: null, dport: null })];

    expect(
      evaluateHostReachability(rules, "ACCEPT", { port: 9999, proto: "udp" }),
    ).toBe("DROP");
  });
});

describe("evaluateGuestReachability", () => {
  test("an inactive firewall blocks nothing", () => {
    expect(
      evaluateGuestReachability(guest({ active: false }), {
        port: 22,
        proto: "tcp",
      }),
    ).toBe("ACCEPT");
  });

  test("an unreadable firewall yields unknown", () => {
    expect(
      evaluateGuestReachability(guest({ readable: false }), {
        port: 22,
        proto: "tcp",
      }),
    ).toBe("unknown");
  });

  test("it applies the default policy when no rule matches", () => {
    expect(evaluateGuestReachability(guest(), { port: 22, proto: "tcp" })).toBe(
      "DROP",
    );
  });

  test("it ignores loopback-scoped rules", () => {
    // `-A INPUT -i lo -j ACCEPT` accepts everything, but not from the internet.
    const state = guest({ rules: [guestRule({ iface: "lo", dport: null })] });

    expect(evaluateGuestReachability(state, { port: 6379, proto: "tcp" })).toBe(
      "DROP",
    );
  });

  test("it honours a rule bound to a non-loopback interface", () => {
    const state = guest({
      rules: [guestRule({ iface: "eth0", action: "ACCEPT", dport: "443" })],
    });

    expect(evaluateGuestReachability(state, { port: 443, proto: "tcp" })).toBe(
      "ACCEPT",
    );
  });

  test("it skips rules it cannot reason about", () => {
    const state = guest({
      rules: [
        guestRule({ action: "ACCEPT", dport: "!22" }),
        guestRule({ action: "ACCEPT", dport: "22", sourceAddr: "!10.0.0.0/8" }),
      ],
    });

    expect(evaluateGuestReachability(state, { port: 22, proto: "tcp" })).toBe(
      "DROP",
    );
  });

  test("it ignores rules that decide nothing, such as logging", () => {
    const state = guest({
      rules: [
        guestRule({ action: null, dport: null }),
        guestRule({ action: "ACCEPT", dport: "22" }),
      ],
    });

    expect(evaluateGuestReachability(state, { port: 22, proto: "tcp" })).toBe(
      "ACCEPT",
    );
  });
});

describe("analyzeFirewall", () => {
  test("a plain web server produces no findings", () => {
    // The most important case in the suite: a list that cries wolf on 22, 80
    // and 443 trains customers to ignore every finding it ever produces.
    const findings = analyzeFirewall({
      hostRules: [],
      hostPolicy: "ACCEPT",
      guest: null,
      listeners: [
        listener(22, { processes: [{ name: "sshd", pid: 1 }] }),
        listener(80, { processes: [{ name: "nginx", pid: 2 }] }),
        listener(443, { processes: [{ name: "nginx", pid: 2 }] }),
      ],
    });

    expect(findings).toEqual([]);
  });

  test("it reports a database reachable from the internet", () => {
    const findings = analyzeFirewall({
      hostRules: [],
      hostPolicy: "ACCEPT",
      guest: null,
      listeners: [
        listener(3306, { processes: [{ name: "mariadbd", pid: 9 }] }),
      ],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "EXPOSED_SENSITIVE_PORT",
      severity: "critical",
      port: 3306,
      proto: "tcp",
      service: "MySQL / MariaDB",
      processes: ["mariadbd"],
      suggestedRule: {
        direction: "in",
        action: "DROP",
        proto: "tcp",
        dport: "3306",
      },
    });
  });

  test("it stays silent about a database bound to loopback", () => {
    // The whole reason for reading sockets instead of scanning: this is safe.
    const findings = analyzeFirewall({
      hostRules: [],
      hostPolicy: "ACCEPT",
      guest: null,
      listeners: [listener(3306, { address: "127.0.0.1", scope: "loopback" })],
    });

    expect(findings).toEqual([]);
  });

  test("it stays silent when the Virtbase firewall already blocks the port", () => {
    const findings = analyzeFirewall({
      hostRules: [hostRule({ action: "DROP", dport: "6379" })],
      hostPolicy: "ACCEPT",
      guest: null,
      listeners: [listener(6379)],
    });

    expect(findings).toEqual([]);
  });

  test("it stays silent when the firewall inside the server blocks the port", () => {
    const findings = analyzeFirewall({
      hostRules: [],
      hostPolicy: "ACCEPT",
      guest: guest({ defaultPolicy: { incoming: "DROP", outgoing: "ACCEPT" } }),
      listeners: [listener(6379)],
    });

    expect(findings).toEqual([]);
  });

  test("it reports a port both firewalls allow", () => {
    const findings = analyzeFirewall({
      hostRules: [],
      hostPolicy: "ACCEPT",
      guest: guest({ rules: [guestRule({ action: "ACCEPT", dport: "6379" })] }),
      listeners: [listener(6379)],
    });

    expect(codes(findings)).toEqual(["EXPOSED_SENSITIVE_PORT"]);
    expect(findings[0]?.service).toBe("Redis");
  });

  test("it reports one finding for a service bound to both address families", () => {
    const findings = analyzeFirewall({
      hostRules: [],
      hostPolicy: "ACCEPT",
      guest: null,
      listeners: [
        listener(6379, { address: "0.0.0.0", family: "ipv4" }),
        listener(6379, { address: "::", family: "ipv6" }),
      ],
    });

    expect(findings).toHaveLength(1);
  });

  test("it explains a rule the firewall inside the server overrules", () => {
    const findings = analyzeFirewall({
      hostRules: [hostRule({ pos: 3, action: "ACCEPT", dport: "8443" })],
      hostPolicy: "DROP",
      guest: guest({ rules: [guestRule({ action: "DROP", dport: "8443" })] }),
      listeners: [],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "BLOCKED_BY_GUEST_FIREWALL",
      severity: "warning",
      port: 8443,
      hostRulePos: 3,
      manager: "ufw",
    });
  });

  test("it reports a rule with nothing listening behind it", () => {
    const findings = analyzeFirewall({
      hostRules: [hostRule({ pos: 2, action: "ACCEPT", dport: "8080" })],
      hostPolicy: "DROP",
      guest: null,
      listeners: [listener(80)],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "ORPHAN_RULE",
      severity: "info",
      port: 8080,
      hostRulePos: 2,
    });
  });

  test("it does not call a rule orphaned when the service is listening", () => {
    const findings = analyzeFirewall({
      hostRules: [hostRule({ pos: 0, action: "ACCEPT", dport: "80" })],
      hostPolicy: "DROP",
      guest: null,
      listeners: [listener(80)],
    });

    expect(findings).toEqual([]);
  });

  test("it does not call a port range orphaned", () => {
    // A range is far more likely to be deliberate, and has no one port to name.
    const findings = analyzeFirewall({
      hostRules: [hostRule({ action: "ACCEPT", dport: "8000:8100" })],
      hostPolicy: "DROP",
      guest: null,
      listeners: [],
    });

    expect(findings).toEqual([]);
  });

  test("it declines to advise when the sockets could not be read", () => {
    const findings = analyzeFirewall({
      hostRules: [hostRule({ action: "ACCEPT", dport: "8080" })],
      hostPolicy: "ACCEPT",
      guest: null,
      listeners: null,
    });

    expect(codes(findings)).toEqual(["ANALYSIS_INCOMPLETE"]);
  });

  test("it declines to advise when a firewall is present but unreadable", () => {
    // Guessing here would either invent warnings or hide real ones.
    const findings = analyzeFirewall({
      hostRules: [],
      hostPolicy: "ACCEPT",
      guest: guest({ readable: false, manager: "firewalld" }),
      listeners: [listener(6379)],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "ANALYSIS_INCOMPLETE",
      manager: "firewalld",
    });
  });

  test("it declines to advise when Proxmox reported no default policy", () => {
    const findings = analyzeFirewall({
      hostRules: [],
      hostPolicy: null,
      guest: null,
      listeners: [listener(6379)],
    });

    expect(findings).toEqual([]);
  });

  test("it reports a UDP amplification service", () => {
    const findings = analyzeFirewall({
      hostRules: [],
      hostPolicy: "ACCEPT",
      guest: null,
      listeners: [
        listener(161, {
          protocol: "udp",
          processes: [{ name: "snmpd", pid: 4 }],
        }),
      ],
    });

    expect(findings[0]).toMatchObject({
      code: "EXPOSED_SENSITIVE_PORT",
      severity: "critical",
      proto: "udp",
      service: "SNMP",
    });
  });

  test("it puts the most severe finding first", () => {
    const findings = analyzeFirewall({
      hostRules: [hostRule({ pos: 1, action: "ACCEPT", dport: "8080" })],
      hostPolicy: "ACCEPT",
      guest: null,
      listeners: [listener(6379), listener(3389)],
    });

    expect(findings.map((f) => f.severity)).toEqual([
      "critical",
      "warning",
      "info",
    ]);
  });
});
