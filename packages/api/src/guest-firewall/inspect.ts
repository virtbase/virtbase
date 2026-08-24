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
  GuestFirewallManager,
  GuestFirewallPolicy,
  GuestFirewallRule,
  ListeningSocket,
} from "@virtbase/utils";
import { mapProxmoxServerStatus, ProxmoxServerStatus } from "@virtbase/utils";
import type { GuestFirewallStatus } from "@virtbase/validators/server";
import type { ProxmoxVm } from "../proxmox/agent";
import { getGuestOsInfo, isPosixGuest } from "../proxmox/agent";
import { cached } from "../upstash";
import type { DetectedManager } from "./detect";
import { detectGuestFirewalls } from "./detect";
import { canReadRules, readGuestFirewallRules } from "./read-rules";
import { readListeningSockets } from "./read-sockets";

/**
 * How long one inspection is reused.
 *
 * Every inspection runs commands inside somebody's server, while the pages that
 * show the result refetch whenever they regain focus. Without this, one open
 * browser tab becomes steady load on a customer's machine.
 */
const CACHE_TTL_SECONDS = 90;

/**
 * Everything one look inside a server produces.
 *
 * The firewall and the listening sockets are gathered together rather than
 * behind separate endpoints because they are read in the same trip and are only
 * useful together: a port is exposed when something is listening on it *and*
 * neither firewall blocks it. Splitting them would double the commands run
 * inside the customer's server to answer one question.
 */
export interface GuestInspection {
  status: GuestFirewallStatus;
  managers: DetectedManager[];
  primary: GuestFirewallManager | null;
  defaultPolicy: GuestFirewallPolicy | null;
  rules: GuestFirewallRule[];
  /** Set when a firewall was found that there is no parser for yet. */
  unreadableManager: GuestFirewallManager | null;
  /** `null` when the sockets could not be read. */
  sockets: ListeningSocket[] | null;
  /** Epoch milliseconds - a `Date` would not survive the JSON cache. */
  checkedAt: number;
}

const unavailable = (): GuestInspection => ({
  status: "unavailable",
  managers: [],
  primary: null,
  defaultPolicy: null,
  rules: [],
  unreadableManager: null,
  sockets: null,
  checkedAt: Date.now(),
});

/**
 * Looks inside a server once, and remembers the answer briefly.
 *
 * Never throws, and never reports "nothing is filtering" for a server it could
 * not reach - `unavailable` and `no_firewall` stay distinct all the way to the
 * customer, because telling somebody their server is unprotected when nobody
 * checked is worse than saying nothing.
 */
export const inspectGuest = ({
  vm,
  serverId,
  refresh,
}: {
  vm: ProxmoxVm;
  serverId: string;
  refresh?: boolean;
}): Promise<GuestInspection> =>
  cached<GuestInspection>(
    `guest-inspection:${serverId}`,
    CACHE_TTL_SECONDS,
    async () => {
      // One call answers both questions: whether the server is running, and
      // whether its configuration enables the agent at all.
      const current = await vm.status.current.$get();

      if (
        !current.agent ||
        mapProxmoxServerStatus(current) !== ProxmoxServerStatus.RUNNING
      ) {
        return unavailable();
      }

      // Every probe below runs POSIX tooling that does not exist on Windows.
      if (!isPosixGuest(await getGuestOsInfo(vm))) {
        return unavailable();
      }

      const detection = await detectGuestFirewalls(vm);

      if (detection.failure) {
        return unavailable();
      }

      // Read regardless of what was detected: a server with no firewall at all
      // is exactly the one whose open ports are worth knowing about.
      const socketResult = await readListeningSockets(vm);
      const sockets =
        socketResult.status === "ok" ? socketResult.sockets : null;

      const common = {
        managers: detection.managers,
        primary: detection.primary,
        sockets,
        checkedAt: Date.now(),
      };

      if (!detection.primary) {
        return {
          ...common,
          status: "no_firewall",
          defaultPolicy: null,
          rules: [],
          unreadableManager: null,
        };
      }

      // Detected but not yet parseable. The customer still needs to know it is
      // there, because its rules still apply to their traffic.
      if (!canReadRules(detection.primary)) {
        return {
          ...common,
          status: "ok",
          defaultPolicy: null,
          rules: [],
          unreadableManager: detection.primary,
        };
      }

      const ruleResult = await readGuestFirewallRules(vm, detection.primary);

      if (ruleResult.status !== "ok") {
        // Detection succeeded a moment ago, so the firewall is real even though
        // the dump failed. Report it without rules rather than pretending the
        // server is unprotected.
        return {
          ...common,
          status: "ok",
          defaultPolicy: null,
          rules: [],
          unreadableManager: detection.primary,
        };
      }

      return {
        ...common,
        status: "ok",
        defaultPolicy: ruleResult.state.defaultPolicy,
        rules: ruleResult.state.rules,
        unreadableManager: null,
      };
    },
    { refresh },
  );
