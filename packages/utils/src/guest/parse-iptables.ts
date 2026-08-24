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
 * The only table that decides whether traffic is allowed in.
 *
 * `iptables-save` with no arguments dumps every table, and `nat` or `mangle`
 * rules would otherwise be presented as if they filtered something.
 */
const FILTER_TABLE = "filter";

const ACTIONS: Record<string, FirewallAction> = {
  ACCEPT: "ACCEPT",
  DROP: "DROP",
  REJECT: "REJECT",
};

/**
 * `-m comment --comment "allow web traffic"`
 *
 * Read off the whole line rather than the token list, because a quoted comment
 * is the one value in the format that can contain spaces.
 */
const COMMENT_PATTERN = /--comment\s+(?:"([^"]*)"|(\S+))/;

interface RuleArgs {
  proto: string | null;
  sport: string | null;
  dport: string | null;
  sourceAddr: string | null;
  destAddr: string | null;
  iface: string | null;
  target: string | null;
}

/**
 * Walks an `-A` rule's arguments.
 *
 * A negation (`! -s 10.0.0.0/8`) is kept in the captured value rather than
 * dropped, so that a rule matching "everything except this network" can never
 * be mistaken for one matching that network.
 */
const parseRuleArgs = (tokens: string[]): RuleArgs => {
  const args: RuleArgs = {
    proto: null,
    sport: null,
    dport: null,
    sourceAddr: null,
    destAddr: null,
    iface: null,
    target: null,
  };

  let negated = false;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (token === "!") {
      negated = true;
      continue;
    }

    const value = tokens[index + 1];
    const prefix = negated ? "!" : "";

    switch (token) {
      case "-p":
      case "--protocol":
        args.proto = value ? `${prefix}${value.toLowerCase()}` : null;
        break;
      case "-s":
      case "--source":
        args.sourceAddr = value ? `${prefix}${value}` : null;
        break;
      case "-d":
      case "--destination":
        args.destAddr = value ? `${prefix}${value}` : null;
        break;
      case "--dport":
      case "--dports":
      case "--destination-port":
      case "--destination-ports":
        args.dport = value ? `${prefix}${value}` : null;
        break;
      case "--sport":
      case "--sports":
      case "--source-port":
      case "--source-ports":
        args.sport = value ? `${prefix}${value}` : null;
        break;
      case "-i":
      case "--in-interface":
      case "-o":
      case "--out-interface":
        args.iface = value ? `${prefix}${value}` : null;
        break;
      case "-j":
      case "--jump":
        args.target = value ?? null;
        break;
      default:
        break;
    }

    negated = false;
  }

  return args;
};

/**
 * Parses `iptables-save` output.
 *
 * Only the `filter` table is returned. Rules whose target is not a verdict -
 * `LOG`, `RETURN`, a jump into a user chain such as Docker's - keep a `null`
 * action, because they neither allow nor block anything by themselves; their
 * `chain` and `raw` are preserved so the UI can still show them.
 *
 * The chain names carry the direction, which is why `INPUT` and `OUTPUT` map
 * to `in` and `out` while `FORWARD` and user chains map to nothing.
 */
export const parseIptablesSave = (stdout: string): GuestFirewallState => {
  const rules: GuestFirewallRule[] = [];
  const policy: GuestFirewallPolicy = { incoming: null, outgoing: null };

  let table: string | null = null;
  let sawPolicy = false;
  let index = 0;

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || trimmed === "COMMIT") {
      continue;
    }

    if (trimmed.startsWith("*")) {
      table = trimmed.slice(1).trim();
      continue;
    }

    if (table !== FILTER_TABLE) {
      continue;
    }

    // `:INPUT DROP [0:0]` - a built-in chain and its default policy.
    // `:DOCKER - [0:0]`   - a user chain, which has none.
    if (trimmed.startsWith(":")) {
      const [chain, verdict] = trimmed.slice(1).split(/\s+/);
      const action = ACTIONS[verdict ?? ""];

      if (action && chain === "INPUT") {
        policy.incoming = action;
        sawPolicy = true;
      } else if (action && chain === "OUTPUT") {
        policy.outgoing = action;
        sawPolicy = true;
      }

      continue;
    }

    if (!trimmed.startsWith("-A")) {
      continue;
    }

    const tokens = trimmed.split(/\s+/);
    const chain = tokens[1] ?? null;
    const args = parseRuleArgs(tokens.slice(2));
    const comment = COMMENT_PATTERN.exec(trimmed);

    index += 1;

    rules.push({
      manager: "iptables",
      index,
      chain,
      direction: chain === "INPUT" ? "in" : chain === "OUTPUT" ? "out" : null,
      // A jump to LOG or a user chain is not a verdict.
      action: ACTIONS[args.target ?? ""] ?? null,
      proto: args.proto,
      dport: args.dport,
      sport: args.sport,
      sourceAddr: args.sourceAddr,
      destAddr: args.destAddr,
      iface: args.iface,
      comment: comment?.[1] ?? comment?.[2] ?? null,
      raw: trimmed,
    });
  }

  return {
    manager: "iptables",
    // Unlike ufw, iptables has no on/off switch: it is filtering whenever there
    // is a ruleset to read.
    active: rules.length > 0 || sawPolicy,
    defaultPolicy: sawPolicy ? policy : null,
    rules,
  };
};
