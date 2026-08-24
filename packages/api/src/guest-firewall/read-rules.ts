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

import type { GuestFirewallManager, GuestFirewallState } from "@virtbase/utils";
import { parseIptablesSave, parseUfwStatus } from "@virtbase/utils";
import type { GuestAgentFailure, ProxmoxVm } from "../proxmox/agent";
import { runGuestCommand } from "../proxmox/agent";
import { RULE_DUMP_SCRIPTS, shell } from "./commands";

/**
 * The managers whose rules Virtbase can read today.
 *
 * ufw and iptables cover the overwhelming majority of Linux VPS installs, and
 * each parser is worth shipping on its own rather than waiting for all four.
 * A detected manager that is not in here is reported as detected but unread,
 * which is honest and still lets the UI warn about the conflict.
 */
const PARSERS: Partial<
  Record<GuestFirewallManager, (stdout: string) => GuestFirewallState>
> = {
  ufw: parseUfwStatus,
  iptables: parseIptablesSave,
};

export type GuestFirewallRulesResult =
  | { status: "ok"; state: GuestFirewallState }
  /** Detected, but there is no parser for it yet. */
  | { status: "unsupported_manager"; manager: GuestFirewallManager }
  // The failure is nested rather than spread: it carries a `status` of its own,
  // which would otherwise silently overwrite this one.
  | { status: "failed"; failure: GuestAgentFailure };

/** Whether the rules of a detected manager can be read. */
export const canReadRules = (manager: GuestFirewallManager): boolean =>
  manager in PARSERS;

/**
 * Reads the rules of one firewall manager inside a server.
 *
 * Only ever asks about the manager it was told to: dumping all four would
 * return the same ruleset in up to four different vocabularies, since the front
 * ends compile down to the backends.
 */
export const readGuestFirewallRules = async (
  vm: ProxmoxVm,
  manager: GuestFirewallManager,
): Promise<GuestFirewallRulesResult> => {
  const parse = PARSERS[manager];

  if (!parse) {
    return { status: "unsupported_manager", manager };
  }

  const result = await runGuestCommand(vm, shell(RULE_DUMP_SCRIPTS[manager]));

  if (result.status !== "ok") {
    return { status: "failed", failure: result };
  }

  return { status: "ok", state: parse(result.stdout) };
};
