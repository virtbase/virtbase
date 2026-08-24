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

import type { ExposureSeverity } from "../constants/firewall";
import { findSensitivePort } from "../constants/firewall";
import type {
  FirewallAction,
  GuestFirewallManager,
  GuestFirewallPolicy,
  GuestFirewallRule,
  ListeningSocket,
  SocketProtocol,
} from "./types";

/**
 * What a firewall does to a packet arriving from an arbitrary internet host.
 *
 * `unknown` is a first-class answer rather than a guess. Assuming `ACCEPT`
 * invents security warnings; assuming `DROP` hides real ones. Saying so lets
 * the caller decline to give advice it cannot stand behind.
 */
export type Reachability = FirewallAction | "unknown";

/**
 * A Proxmox rule, reduced to what deciding reachability needs.
 *
 * Declared structurally rather than imported: this package sits below the
 * validators that describe the API, so the composition layer maps into it.
 */
export interface HostFirewallRuleInput {
  pos: number;
  enabled: boolean;
  direction: "in" | "out" | null;
  action: FirewallAction;
  proto: string | null;
  dport: string | null;
  /** A source restriction makes the rule conditional. */
  source: string | null;
}

export interface GuestFirewallInput {
  active: boolean;
  /** Whether the rules below could actually be read. */
  readable: boolean;
  manager: GuestFirewallManager | null;
  defaultPolicy: GuestFirewallPolicy | null;
  rules: GuestFirewallRule[];
}

export interface AnalyzeFirewallInput {
  hostRules: HostFirewallRuleInput[];
  /** The Proxmox inbound default policy, `null` when Proxmox did not report it. */
  hostPolicy: FirewallAction | null;
  /** `null` when the guest could not be inspected at all. */
  guest: GuestFirewallInput | null;
  /** `null` when the listening sockets could not be read. */
  listeners: ListeningSocket[] | null;
}

export type FirewallFindingCode =
  /** A sensitive service is reachable from the internet. */
  | "EXPOSED_SENSITIVE_PORT"
  /** A Virtbase rule allows a port that the firewall inside the server blocks. */
  | "BLOCKED_BY_GUEST_FIREWALL"
  /** A rule opens a port that nothing is listening on. */
  | "ORPHAN_RULE"
  /** Something could not be inspected, so the list may be incomplete. */
  | "ANALYSIS_INCOMPLETE";

export interface SuggestedRule {
  direction: "in";
  action: FirewallAction;
  proto: SocketProtocol;
  dport: string;
}

export interface FirewallFinding {
  code: FirewallFindingCode;
  severity: ExposureSeverity;
  port: number | null;
  proto: SocketProtocol | null;
  /** The catalogue name of the service, when the port is a known one. */
  service: string | null;
  /** Process names reported by the guest, for a recognisable message. */
  processes: string[];
  /** The Proxmox rule this finding is about, for `ORPHAN_RULE`. */
  hostRulePos: number | null;
  /** The firewall inside the server, for `BLOCKED_BY_GUEST_FIREWALL`. */
  manager: GuestFirewallManager | null;
  /** A rule that resolves the finding, when there is an obvious one. */
  suggestedRule: SuggestedRule | null;
}

const SEVERITY_ORDER: Record<ExposureSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** A value the manager wrote as a negation, which this cannot reason about. */
const isNegated = (value: string | null): boolean =>
  typeof value === "string" && value.startsWith("!");

/**
 * Whether a rule's address field leaves it applying to arbitrary hosts.
 *
 * Managers spell "anywhere" several ways, and anything else narrows the rule to
 * a network that an internet visitor is not part of.
 */
const isAnySource = (value: string | null): boolean =>
  !value ||
  value === "0.0.0.0/0" ||
  value === "::/0" ||
  value.toLowerCase() === "anywhere";

/**
 * Whether a port specification covers a port.
 *
 * Covers everything the managers emit: a single port, a comma-separated list,
 * and the `:` and `-` range forms used by Proxmox and iptables respectively.
 */
export const matchesPortSpec = (spec: string | null, port: number): boolean => {
  if (!spec) {
    // No port restriction at all - the rule covers every port.
    return true;
  }

  for (const part of spec.split(",")) {
    const range = part.trim();

    if (!range) {
      continue;
    }

    const bounds = range.split(/[:-]/);

    if (bounds.length === 2) {
      const from = Number.parseInt(bounds[0] ?? "", 10);
      const to = Number.parseInt(bounds[1] ?? "", 10);

      if (
        Number.isInteger(from) &&
        Number.isInteger(to) &&
        port >= from &&
        port <= to
      ) {
        return true;
      }

      continue;
    }

    if (Number.parseInt(range, 10) === port) {
      return true;
    }
  }

  return false;
};

const protocolMatches = (rule: string | null, proto: SocketProtocol): boolean =>
  !rule || rule.toLowerCase() === proto;

/**
 * Decides what the Proxmox firewall does with a packet from the internet.
 *
 * Walks the rules the way Proxmox does - in order, first match wins - and falls
 * back to the default policy. Rules that cannot decide the question are skipped
 * rather than guessed at: a rule restricted to one source network neither
 * allows nor blocks an arbitrary visitor, so evaluation continues past it.
 */
export const evaluateHostReachability = (
  rules: HostFirewallRuleInput[],
  policy: FirewallAction | null,
  target: { port: number; proto: SocketProtocol },
): Reachability => {
  const ordered = [...rules].sort((a, b) => a.pos - b.pos);

  for (const rule of ordered) {
    if (!rule.enabled) {
      continue;
    }

    // Proxmox always records a direction; a rule without one cannot be placed
    // on the inbound path, so it is left to the next rule to decide.
    if (rule.direction !== "in") {
      continue;
    }

    if (!isAnySource(rule.source) || isNegated(rule.source)) {
      continue;
    }

    if (!protocolMatches(rule.proto, target.proto)) {
      continue;
    }

    if (!matchesPortSpec(rule.dport, target.port)) {
      continue;
    }

    return rule.action;
  }

  return policy ?? "unknown";
};

/**
 * Decides what the firewall inside the server does with the same packet.
 *
 * Loopback-scoped rules are skipped because they cannot apply to traffic from
 * the internet. Rules bound to any other interface are treated as applying:
 * which interface faces the internet is not knowable from here, and missing a
 * real block would be the worse mistake.
 */
export const evaluateGuestReachability = (
  guest: GuestFirewallInput,
  target: { port: number; proto: SocketProtocol },
): Reachability => {
  if (!guest.active) {
    // Nothing is filtering inside the server.
    return "ACCEPT";
  }

  if (!guest.readable) {
    return "unknown";
  }

  for (const rule of guest.rules) {
    // A logging rule or a jump into another chain is not a verdict.
    if (!rule.action || rule.direction !== "in") {
      continue;
    }

    if (rule.iface === "lo") {
      continue;
    }

    if (
      !isAnySource(rule.sourceAddr) ||
      isNegated(rule.sourceAddr) ||
      isNegated(rule.proto) ||
      isNegated(rule.dport)
    ) {
      continue;
    }

    if (!protocolMatches(rule.proto, target.proto)) {
      continue;
    }

    if (!matchesPortSpec(rule.dport, target.port)) {
      continue;
    }

    return rule.action;
  }

  return guest.defaultPolicy?.incoming ?? "unknown";
};

/** Sockets that an internet visitor could reach if the firewalls allowed it. */
const internetFacing = (listeners: ListeningSocket[]): ListeningSocket[] =>
  listeners.filter((socket) => socket.scope === "wildcard");

/**
 * Turns what is listening and what the two firewalls do into advice.
 *
 * Pure on purpose: this is the part of the feature most worth being sure about,
 * and the only way to be sure is to check every combination without a Proxmox
 * node or a customer VM in the loop.
 *
 * The list is kept short by design. Ports 22, 80 and 443 are open on almost
 * every server, so flagging everything reachable would bury the one finding
 * that matters. Only services that are dangerous *because* they are reachable
 * produce an exposure finding.
 */
export const analyzeFirewall = ({
  hostRules,
  hostPolicy,
  guest,
  listeners,
}: AnalyzeFirewallInput): FirewallFinding[] => {
  const findings: FirewallFinding[] = [];

  const base = {
    port: null,
    proto: null,
    service: null,
    processes: [],
    hostRulePos: null,
    manager: null,
    suggestedRule: null,
  } satisfies Omit<FirewallFinding, "code" | "severity">;

  if (listeners === null) {
    findings.push({
      ...base,
      code: "ANALYSIS_INCOMPLETE",
      severity: "info",
    });

    return findings;
  }

  // A firewall we can see but not read leaves every verdict uncertain. Guessing
  // here would either invent warnings or hide real ones, so the analysis says
  // so and stops.
  if (guest?.active && !guest.readable) {
    return [
      {
        ...base,
        code: "ANALYSIS_INCOMPLETE",
        severity: "info",
        manager: guest.manager,
      },
    ];
  }

  const exposed = new Map<string, FirewallFinding>();

  for (const socket of internetFacing(listeners)) {
    const target = { port: socket.port, proto: socket.protocol };
    const key = `${socket.protocol}:${socket.port}`;

    // The same service bound to both address families is one finding.
    if (exposed.has(key)) {
      continue;
    }

    const host = evaluateHostReachability(hostRules, hostPolicy, target);

    if (host !== "ACCEPT") {
      continue;
    }

    const insideVerdict = guest
      ? evaluateGuestReachability(guest, target)
      : "ACCEPT";

    if (insideVerdict !== "ACCEPT") {
      continue;
    }

    const sensitive = findSensitivePort(socket.port, socket.protocol);

    if (!sensitive) {
      continue;
    }

    exposed.set(key, {
      ...base,
      code: "EXPOSED_SENSITIVE_PORT",
      severity: sensitive.severity,
      port: socket.port,
      proto: socket.protocol,
      service: sensitive.service,
      processes: socket.processes.map((process) => process.name),
      suggestedRule: {
        direction: "in",
        action: "DROP",
        proto: socket.protocol,
        dport: String(socket.port),
      },
    });
  }

  findings.push(...exposed.values());

  const listening = new Set(
    listeners.map((socket) => `${socket.protocol}:${socket.port}`),
  );

  for (const rule of hostRules) {
    if (
      !rule.enabled ||
      rule.direction !== "in" ||
      rule.action !== "ACCEPT" ||
      !rule.dport
    ) {
      continue;
    }

    const port = Number.parseInt(rule.dport, 10);

    // Only single-port rules: a range or a list has no one port to report, and
    // is far more likely to be deliberate.
    if (!Number.isInteger(port) || String(port) !== rule.dport.trim()) {
      continue;
    }

    const proto = rule.proto?.toLowerCase();

    if (proto !== "tcp" && proto !== "udp") {
      continue;
    }

    if (listening.has(`${proto}:${port}`)) {
      continue;
    }

    // The Virtbase rule opens the port, but the firewall inside the server
    // closes it - which is why the customer's service looks unreachable.
    const insideVerdict = guest
      ? evaluateGuestReachability(guest, { port, proto })
      : "ACCEPT";

    if (insideVerdict === "DROP" || insideVerdict === "REJECT") {
      findings.push({
        ...base,
        code: "BLOCKED_BY_GUEST_FIREWALL",
        severity: "warning",
        port,
        proto,
        hostRulePos: rule.pos,
        manager: guest?.manager ?? null,
      });

      continue;
    }

    findings.push({
      ...base,
      code: "ORPHAN_RULE",
      severity: "info",
      port,
      proto,
      hostRulePos: rule.pos,
    });
  }

  return findings.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
};
