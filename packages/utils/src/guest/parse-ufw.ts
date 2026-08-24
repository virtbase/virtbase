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

import type {
  FirewallAction,
  GuestFirewallPolicy,
  GuestFirewallRule,
  GuestFirewallState,
} from "./types";

/**
 * `[ 1] 22/tcp                     ALLOW IN    Anywhere`
 *
 * Anchoring on the action token rather than on column positions is what makes
 * this survive real output: the To and From columns contain spaces of their own
 * (`22/tcp (v6)`, `Anywhere on eth0`), but the columns are always separated by
 * at least two spaces, while the action's own words are separated by one.
 */
const RULE_PATTERN =
  /^(?:\[\s*(\d+)\]\s+)?(\S.*?)\s{2,}(ALLOW|DENY|REJECT|LIMIT)(?:\s+(IN|OUT|FWD))?(?:\s{2,}(\S.*?))?\s*$/;

/** `Default: deny (incoming), allow (outgoing), disabled (routed)` */
const DEFAULT_PATTERN = /^Default:\s*(.+)$/;

const POLICY_PATTERN = /\b(allow|deny|reject)\s*\((incoming|outgoing)\)/g;

/**
 * ufw's verdicts in Proxmox's vocabulary.
 *
 * `LIMIT` folds into `ACCEPT` deliberately: it is an allow with rate limiting,
 * so for "can this port be reached" it behaves as an allow. The distinction
 * survives in the rule's `raw` line, which is what the UI shows.
 */
const ACTIONS: Record<string, FirewallAction> = {
  ALLOW: "ACCEPT",
  LIMIT: "ACCEPT",
  DENY: "DROP",
  REJECT: "REJECT",
};

const POLICIES: Record<string, FirewallAction> = {
  allow: "ACCEPT",
  deny: "DROP",
  reject: "REJECT",
};

/** ufw writes "Anywhere", optionally with a family or interface qualifier. */
const isAnywhere = (value: string): boolean =>
  /^Anywhere\b/i.test(value.trim());

/** Drops the `(v6)` family marker ufw appends to IPv6 rules. */
const stripFamily = (value: string): string =>
  value.replace(/\s*\(v6\)\s*$/i, "").trim();

/**
 * Splits ufw's To/From column into an address and a port spec.
 *
 * The column is one of `22/tcp`, `80,443/tcp`, `22`, `Anywhere`,
 * `192.168.0.1 80/tcp`, or any of those followed by `on eth0`.
 */
const parseEndpoint = (
  value: string,
): {
  address: string | null;
  port: string | null;
  proto: string | null;
  iface: string | null;
} => {
  // The interface qualifier is not part of the address, but it is not noise
  // either - a rule scoped to `lo` exposes nothing.
  const scoped = /^(.*?)\s+on\s+(\S+)$/i.exec(stripFamily(value));
  const withoutInterface = scoped?.[1]?.trim() ?? stripFamily(value);
  const iface = scoped?.[2] ?? null;

  if (!withoutInterface || isAnywhere(withoutInterface)) {
    return { address: null, port: null, proto: null, iface };
  }

  const tokens = withoutInterface.split(/\s+/);
  const last = tokens[tokens.length - 1] ?? "";
  const address = tokens.length > 1 ? tokens.slice(0, -1).join(" ") : null;

  // A port spec is digits, ranges and lists, optionally suffixed with /proto.
  const match = /^(\d[\d,:-]*)(?:\/(\w+))?$/.exec(last);

  if (!match) {
    // Not a port at all - the whole column is an address.
    return { address: withoutInterface, port: null, proto: null, iface };
  }

  return {
    address,
    port: match[1] ?? null,
    proto: match[2]?.toLowerCase() ?? null,
    iface,
  };
};

const parseDefaultPolicy = (line: string): GuestFirewallPolicy => {
  const policy: GuestFirewallPolicy = { incoming: null, outgoing: null };

  for (const [, verdict, direction] of line.matchAll(POLICY_PATTERN)) {
    const action = POLICIES[verdict ?? ""] ?? null;

    if (direction === "incoming") {
      policy.incoming = action;
    } else if (direction === "outgoing") {
      policy.outgoing = action;
    }
  }

  return policy;
};

/**
 * Parses `ufw status`, in any of its verbose and numbered forms.
 *
 * One parser covers all of them because they share the same rule table; the
 * verbose form merely adds the `Default:` line, and the numbered form merely
 * adds the `[ n]` prefix. Anything that does not match the rule shape - the
 * column headers, the dashes under them, blank lines - is skipped.
 *
 * ufw's output is not localised, so matching on its English keywords is safe.
 */
export const parseUfwStatus = (stdout: string): GuestFirewallState => {
  const rules: GuestFirewallRule[] = [];
  let active = false;
  let defaultPolicy: GuestFirewallPolicy | null = null;

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (/^Status:/i.test(trimmed)) {
      active = /\bactive\b/i.test(trimmed) && !/\binactive\b/i.test(trimmed);
      continue;
    }

    const defaults = DEFAULT_PATTERN.exec(trimmed);
    if (defaults?.[1]) {
      defaultPolicy = parseDefaultPolicy(defaults[1]);
      continue;
    }

    const match = RULE_PATTERN.exec(trimmed);
    if (!match) {
      continue;
    }

    const [, index, to, verdict, direction, from] = match;

    // The header row - "To    Action    From" - matches the shape of a rule
    // only if ALLOW/DENY/REJECT/LIMIT appear in it, which they never do.
    const destination = parseEndpoint(to ?? "");
    const source = parseEndpoint(from ?? "");

    rules.push({
      manager: "ufw",
      index: index ? Number.parseInt(index, 10) : null,
      chain: null,
      direction: direction === "IN" ? "in" : direction === "OUT" ? "out" : null,
      action: ACTIONS[verdict ?? ""] ?? null,
      // ufw states the protocol on whichever side carries the port.
      proto: destination.proto ?? source.proto,
      dport: destination.port,
      sport: source.port,
      sourceAddr: source.address,
      destAddr: destination.address,
      iface: destination.iface ?? source.iface,
      // ufw has no per-rule comments.
      comment: null,
      raw: trimmed,
    });
  }

  return { manager: "ufw", active, defaultPolicy, rules };
};
