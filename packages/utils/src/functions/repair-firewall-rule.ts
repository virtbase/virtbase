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

import { FIRWALL_PROTOCOLS_WITH_PORTS } from "../constants/firewall";

export interface RepairableFirewallRule {
  proto?: string | null;
  sport?: string | null;
  dport?: string | null;
  icmp_type?: string | null;
  source?: string | null;
  [key: string]: unknown;
}

const ICMP_PROTOCOLS = new Set(["icmp", "ipv6-icmp"]);

/** Models routinely emit `""` or `null` where the schema wants the key absent. */
const blank = (value: unknown): boolean =>
  value === null || value === undefined || value === "";

/** `"80, 443 "` is the same rule as `"80,443"`, spelled less carefully. */
const tidyPorts = (value: string): string =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(",");

/**
 * Fixes the mistakes a model reliably makes, before validation sees them.
 *
 * Every repair here is a normalisation, never a guess. Dropping an `icmp_type`
 * from a TCP rule cannot change what the rule does, because the firewall would
 * have ignored it anyway; inventing a missing protocol would change the rule
 * entirely, so that case is left to fail validation and be retried instead.
 *
 * Worth doing because a repair costs nothing while a retry costs a whole round
 * trip - and these two mistakes are far and away the most common.
 */
export const repairFirewallRule = <T extends RepairableFirewallRule>(
  rule: T,
): T => {
  const repaired: RepairableFirewallRule = { ...rule };

  for (const key of ["proto", "sport", "dport", "icmp_type", "source"]) {
    if (blank(repaired[key])) {
      repaired[key] = undefined;
    }
  }

  const proto =
    typeof repaired.proto === "string"
      ? repaired.proto.toLowerCase()
      : undefined;

  if (proto) {
    repaired.proto = proto;
  }

  for (const key of ["sport", "dport"] as const) {
    const value = repaired[key];

    if (typeof value === "string") {
      const tidied = tidyPorts(value);
      repaired[key] = tidied === "" ? undefined : tidied;
    }
  }

  // A protocol that has no ports cannot carry one.
  if (proto && !FIRWALL_PROTOCOLS_WITH_PORTS.includes(proto as never)) {
    repaired.sport = undefined;
    repaired.dport = undefined;
  }

  // An ICMP type on anything but ICMP is meaningless.
  if (!proto || !ICMP_PROTOCOLS.has(proto)) {
    repaired.icmp_type = undefined;
  }

  return repaired as T;
};
