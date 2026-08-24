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

import type { GetFirewallRulesOutput } from "../hooks/use-firewall-rules";
import type { GetGuestFirewallOutput } from "../hooks/use-guest-firewall";

export type HostRule = GetFirewallRulesOutput["rules"][number];
export type GuestRule = GetGuestFirewallOutput["guest"]["rules"][number];
export type GuestManager = NonNullable<
  GetGuestFirewallOutput["guest"]["primary"]
>;

/**
 * The fields both layers can fill.
 *
 * Reducing two quite different rule formats to one display shape is what lets
 * the table render a single set of columns; the layers differ only where they
 * genuinely behave differently - editing and position - which each stay behind
 * the discriminant below.
 */
interface FirewallRowBase {
  /** Stable across refetches, so React does not reorder rows on its own. */
  key: string;
  direction: "in" | "out" | null;
  action: "ACCEPT" | "DROP" | "REJECT" | null;
  proto: string | null;
  sport: string | null;
  dport: string | null;
  comment: string | null;
}

export interface HostFirewallRow extends FirewallRowBase {
  layer: "host";
  /** Zero-based Proxmox position; the table displays it one-based. */
  pos: number;
  enabled: boolean;
  /** The untouched rule, for the edit and delete actions. */
  rule: HostRule;
}

export interface GuestFirewallRow extends FirewallRowBase {
  layer: "guest";
  manager: GuestManager;
  index: number | null;
  chain: string | null;
  iface: string | null;
  /**
   * The rule exactly as the firewall printed it.
   *
   * Shown rather than hidden: not every in-VM rule can be fully interpreted,
   * and a line the customer recognises from their own terminal beats a set of
   * empty columns.
   */
  raw: string;
}

export type FirewallTableRow = HostFirewallRow | GuestFirewallRow;

const toHostRow = (rule: HostRule): HostFirewallRow => ({
  layer: "host",
  key: `host-${rule.pos}`,
  pos: rule.pos,
  enabled: Boolean(rule.enabled),
  direction: rule.direction ?? null,
  action: rule.action,
  proto: rule.proto ?? null,
  sport: rule.sport ?? null,
  dport: rule.dport ?? null,
  comment: rule.comment ?? null,
  rule,
});

const toGuestRow = (rule: GuestRule, position: number): GuestFirewallRow => ({
  layer: "guest",
  // The manager's own index is not always present, so position disambiguates.
  key: `guest-${rule.manager}-${rule.index ?? "x"}-${position}`,
  manager: rule.manager,
  index: rule.index,
  chain: rule.chain,
  direction: rule.direction,
  action: rule.action,
  proto: rule.proto,
  sport: rule.sport,
  dport: rule.dport,
  comment: rule.comment,
  iface: rule.iface,
  raw: rule.raw,
});

/**
 * Builds the merged rule list, host rules first.
 *
 * The order mirrors the path an inbound packet takes: it meets the Virtbase
 * firewall on the host before anything inside the server sees it. Reading the
 * table top to bottom therefore reads as the sequence of gates the traffic
 * passes, which is the whole reason for merging the two lists into one.
 */
export const buildFirewallTableRows = ({
  hostRules = [],
  guestRules = [],
}: {
  hostRules?: HostRule[];
  guestRules?: GuestRule[];
}): FirewallTableRow[] => [
  ...hostRules.map(toHostRow),
  ...guestRules.map(toGuestRow),
];

/** How many rows the customer can actually reorder. */
export const countHostRows = (rows: FirewallTableRow[]): number =>
  rows.reduce((total, row) => (row.layer === "host" ? total + 1 : total), 0);
