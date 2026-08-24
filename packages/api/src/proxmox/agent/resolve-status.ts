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

import type { ServerAgentStatus } from "@virtbase/validators/server";
import type { GuestOsInfo } from "./os-info";
import { isPosixGuest } from "./os-info";
import type { GuestAgentProbe } from "./probe";

export interface ResolveAgentStatusParams {
  /** Whether the server's Proxmox configuration enables the agent. */
  configured: boolean;
  /** Whether the server is running. */
  running: boolean;
  /** The probe result, or `null` when the agent was not probed. */
  probe: GuestAgentProbe | null;
  /** The guest operating system, when known. */
  os: GuestOsInfo | null;
}

/**
 * Folds the guest agent signals into the one state a client renders.
 *
 * Kept pure and separate from the router so the combinations - and there are
 * more of them than it looks - can be checked without a Proxmox node.
 */
export const resolveAgentStatus = ({
  configured,
  running,
  probe,
  os,
}: ResolveAgentStatusParams): ServerAgentStatus => {
  // Checked before the power state: the configuration is readable either way,
  // so this stays accurate on a stopped server and is the more actionable of
  // the two.
  if (!configured) {
    return "not_configured";
  }

  if (!running) {
    return "server_stopped";
  }

  if (!probe?.reachable) {
    // A token without VM.GuestAgent.Unrestricted is our problem, not the
    // customer's - never tell them to reinstall a working agent.
    return probe?.failure?.status === "permission_denied"
      ? "unavailable"
      : "unreachable";
  }

  if (!isPosixGuest(os)) {
    return "unsupported_os";
  }

  // `null` means the agent never listed its commands. Treated as usable on
  // purpose: an old agent that cannot introspect usually still runs commands,
  // and a probe that fails is cheaper than a feature hidden for no reason.
  if (probe.execAvailable === false) {
    return "exec_unavailable";
  }

  return "ok";
};
