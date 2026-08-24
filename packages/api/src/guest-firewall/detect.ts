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

import type { GuestFirewallManager } from "@virtbase/utils";
import type { GuestAgentFailure, ProxmoxVm } from "../proxmox/agent";
import { runGuestCommand } from "../proxmox/agent";
import { DETECT_SCRIPT, shell } from "./commands";

/**
 * Which manager owns the ruleset when several are present.
 *
 * ufw and firewalld are front ends that compile down to nftables or iptables,
 * so on a server running ufw all four look "active". Reporting the front end
 * the customer actually configured is both more useful and less alarming than
 * reporting the backend it generated.
 */
export const MANAGER_PRECEDENCE: readonly GuestFirewallManager[] = [
  "ufw",
  "firewalld",
  "nftables",
  "iptables",
];

export interface DetectedManager {
  manager: GuestFirewallManager;
  /** The tooling is installed. */
  present: boolean;
  /** It is filtering, not merely installed. */
  active: boolean;
}

export interface GuestFirewallDetection {
  managers: DetectedManager[];
  /**
   * The manager whose rules are worth showing, or `null` when nothing is
   * filtering inside the guest.
   */
  primary: GuestFirewallManager | null;
  /** Why detection produced nothing. `null` when it ran. */
  failure: GuestAgentFailure | null;
}

const EMPTY_DETECTION: Omit<GuestFirewallDetection, "failure"> = {
  managers: [],
  primary: null,
};

const isManager = (value: string): value is GuestFirewallManager =>
  MANAGER_PRECEDENCE.includes(value as GuestFirewallManager);

/**
 * Parses the detection script's line protocol.
 *
 * Kept separate from the call so the format can be checked without a VM. Lines
 * that are not recognised are ignored rather than treated as an error - a
 * `sh` that warns on stderr should not lose us the detection.
 */
export const parseDetectionOutput = (
  stdout: string,
): Omit<GuestFirewallDetection, "failure"> => {
  const found = new Map<GuestFirewallManager, DetectedManager>();

  for (const line of stdout.split("\n")) {
    const [name, state] = line.trim().split(/\s+/);

    if (!name || !isManager(name)) {
      continue;
    }

    const entry = found.get(name) ?? {
      manager: name,
      present: false,
      active: false,
    };

    if (state === "present") {
      entry.present = true;
    } else if (state === "active") {
      // Being able to answer implies being installed, whatever order the
      // script emitted the lines in.
      entry.present = true;
      entry.active = true;
    }

    found.set(name, entry);
  }

  const managers = MANAGER_PRECEDENCE.filter((manager) =>
    found.has(manager),
  ).map((manager) => found.get(manager) as DetectedManager);

  return {
    managers,
    primary: managers.find((entry) => entry.active)?.manager ?? null,
  };
};

/**
 * Finds out which firewall, if any, is running inside a server.
 *
 * Never throws. A server whose agent is gone reports no managers and a reason,
 * which is the same shape as a server that genuinely has no firewall - the
 * caller distinguishes them by `failure`, and must, because "we could not look"
 * and "we looked and found nothing" mean very different things to show.
 */
export const detectGuestFirewalls = async (
  vm: ProxmoxVm,
): Promise<GuestFirewallDetection> => {
  const result = await runGuestCommand(vm, shell(DETECT_SCRIPT));

  if (result.status !== "ok") {
    return { ...EMPTY_DETECTION, failure: result };
  }

  return { ...parseDetectionOutput(result.stdout), failure: null };
};
