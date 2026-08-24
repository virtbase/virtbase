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

import type { GeneratedFirewallRule } from "@virtbase/validators/server";
import type { BuildContextInput } from "../build-context";

/** What a generated rule has to look like for a case to count as matched. */
export interface ExpectedRule {
  direction?: "in" | "out";
  action?: "ACCEPT" | "DROP" | "REJECT";
  proto?: string;
  dport?: string;
  icmp_type?: string;
  source?: string;
}

export interface EvalCase {
  name: string;
  prompt: string;
  locale?: string;
  /** Overrides on the default server, for cases that depend on its state. */
  server?: Partial<BuildContextInput>;
  /** Every one of these must appear among the generated rules. */
  expect?: ExpectedRule[];
  /** The right answer is no rules at all. */
  expectEmpty?: boolean;
  /** Upper bound on how many rules are reasonable. */
  maxRules?: number;
}

const EMPTY_SERVER: BuildContextInput = {
  os: "Debian GNU/Linux 12 (bookworm)",
  policyIn: "ACCEPT",
  policyOut: "ACCEPT",
  rules: [],
  sockets: [],
  guestManager: null,
};

export const defaultServer = (
  overrides: Partial<BuildContextInput> = {},
): BuildContextInput => ({ ...EMPTY_SERVER, ...overrides });

const socket = (
  port: number,
  name: string,
  protocol: "tcp" | "udp" = "tcp",
  loopback = false,
) => ({
  protocol,
  address: loopback ? "127.0.0.1" : "0.0.0.0",
  port,
  scope: loopback ? ("loopback" as const) : ("wildcard" as const),
  family: "ipv4" as const,
  processes: [{ name, pid: 1 }],
  raw: "",
});

/**
 * The evaluation set.
 *
 * Chosen to cover the ways generation went wrong rather than the ways it went
 * right: protocols without ports, ICMP, requests the server already satisfies,
 * off-topic prompts, and four languages. A model that scores well here is one
 * that has stopped inventing rules, not merely one that produces valid JSON.
 */
export const EVAL_CASES: EvalCase[] = [
  // --- Straightforward, in four languages -------------------------------
  {
    name: "en/allow-https",
    prompt: "Allow HTTPS traffic",
    expect: [{ direction: "in", action: "ACCEPT", proto: "tcp", dport: "443" }],
  },
  {
    name: "de/allow-https",
    prompt: "Erlaube HTTPS-Verkehr auf meinem Server",
    locale: "de",
    expect: [{ direction: "in", action: "ACCEPT", proto: "tcp", dport: "443" }],
  },
  {
    name: "fr/block-ssh",
    prompt: "Bloquer le trafic SSH",
    locale: "fr",
    expect: [{ direction: "in", action: "DROP", proto: "tcp", dport: "22" }],
  },
  {
    name: "nl/allow-http-https",
    prompt: "Sta HTTP en HTTPS toe",
    locale: "nl",
    expect: [{ direction: "in", action: "ACCEPT", proto: "tcp" }],
  },
  // --- Protocols without ports, the classic failure ----------------------
  {
    name: "en/allow-ping",
    prompt: "Let people ping my server",
    expect: [
      {
        direction: "in",
        action: "ACCEPT",
        proto: "icmp",
        icmp_type: "echo-request",
      },
    ],
  },
  {
    name: "de/block-ping",
    prompt: "Blockiere Ping-Anfragen",
    locale: "de",
    expect: [{ direction: "in", action: "DROP", proto: "icmp" }],
  },
  {
    name: "en/allow-wireguard-udp",
    prompt: "Open the WireGuard port 51820",
    expect: [
      { direction: "in", action: "ACCEPT", proto: "udp", dport: "51820" },
    ],
  },
  // --- Uses the server's actual state -----------------------------------
  {
    name: "en/ssh-on-custom-port",
    prompt: "Only allow SSH",
    server: { sockets: [socket(2222, "sshd"), socket(80, "nginx")] },
    // The whole point of the context: SSH is on 2222 here, not 22.
    expect: [
      { direction: "in", action: "ACCEPT", proto: "tcp", dport: "2222" },
    ],
  },
  {
    name: "en/already-blocked-by-policy",
    prompt: "Block all incoming SSH",
    server: { policyIn: "DROP" },
    expectEmpty: true,
  },
  {
    name: "en/rule-already-exists",
    prompt: "Allow HTTPS",
    server: {
      rules: [
        {
          pos: 0,
          enabled: true,
          direction: "in",
          action: "ACCEPT",
          proto: "tcp",
          dport: "443",
          comment: "Allow HTTPS",
        },
      ],
    },
    expectEmpty: true,
  },
  {
    name: "en/loopback-database",
    prompt: "Make sure my database is not reachable from outside",
    server: {
      policyIn: "DROP",
      sockets: [socket(3306, "mariadbd", "tcp", true)],
    },
    // Already unreachable: bound to loopback and the policy drops everything.
    expectEmpty: true,
  },
  // --- Source restrictions ----------------------------------------------
  {
    name: "en/source-restricted",
    prompt: "Allow PostgreSQL only from 10.0.0.0/8",
    expect: [
      {
        direction: "in",
        action: "ACCEPT",
        proto: "tcp",
        dport: "5432",
        source: "10.0.0.0/8",
      },
    ],
  },
  // --- Should refuse to invent ------------------------------------------
  {
    name: "en/off-topic",
    prompt: "What is the weather tomorrow?",
    expectEmpty: true,
  },
  {
    name: "en/nonsense",
    prompt: "asdfghjkl",
    expectEmpty: true,
  },
  {
    name: "de/off-topic",
    prompt: "Wie spät ist es?",
    locale: "de",
    expectEmpty: true,
  },
  // --- Multi-rule, ordering matters -------------------------------------
  {
    name: "en/allow-web-block-rest",
    prompt:
      "Allow HTTP and HTTPS from anywhere, block everything else incoming",
    expect: [
      { direction: "in", action: "ACCEPT", proto: "tcp" },
      { direction: "in", action: "DROP" },
    ],
    maxRules: 4,
  },
  {
    name: "en/outbound-smtp",
    prompt: "Stop my server from sending mail on port 25",
    expect: [{ direction: "out", action: "DROP", proto: "tcp", dport: "25" }],
  },
  {
    name: "en/mail-ports",
    prompt: "Open the mail ports 25, 465 and 587",
    expect: [{ direction: "in", action: "ACCEPT", proto: "tcp" }],
  },
];

/** Whether a generated rule satisfies an expectation. */
export const matchesExpectation = (
  rule: GeneratedFirewallRule,
  expected: ExpectedRule,
): boolean =>
  Object.entries(expected).every(([key, value]) => {
    const actual = rule[key as keyof GeneratedFirewallRule];

    // A port list or range counts as covering the expected port.
    if (key === "dport" && typeof actual === "string") {
      return actual.split(",").some((part) => part.trim() === value);
    }

    return actual === value;
  });
