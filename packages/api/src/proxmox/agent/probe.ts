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

import { classifyAgentError } from "./classify-agent-error";
import type { GuestAgentFailure, ProxmoxVm } from "./types";
import { unwrapAgentResult } from "./unwrap-result";

/** The QGA command every exec-based feature depends on. */
const EXEC_COMMAND = "guest-exec";

export interface GuestAgentProbe {
  /** Whether the agent answered at all. */
  reachable: boolean;
  /**
   * Whether `guest-exec` is available.
   *
   * `null` means the agent answered but did not list its commands, so we cannot
   * tell without trying. Callers should attempt the command rather than
   * assuming it is unavailable.
   */
  execAvailable: boolean | null;
  /** The agent version, when reported. */
  version: string | null;
  /** Why the agent did not answer. `null` when it did. */
  failure: GuestAgentFailure | null;
}

interface SupportedCommand {
  name?: unknown;
  enabled?: unknown;
}

/**
 * Reads the agent's own command list to decide whether `guest-exec` is usable.
 *
 * This is not paranoia: distros routinely ship `qemu-guest-agent` with
 * `guest-exec` listed in `BLOCK_RPCS` in `/etc/default/qemu-guest-agent`, and
 * an agent old enough to predate the command behaves the same way. Both cases
 * are indistinguishable from a missing agent unless we ask first, and they lead
 * the customer to completely different fixes.
 *
 * `agent/info` doubles as the liveness check - it is one call and strictly more
 * informative than `agent/ping`.
 */
export const probeGuestAgent = async (
  vm: ProxmoxVm,
): Promise<GuestAgentProbe> => {
  let info: unknown;
  try {
    info = unwrapAgentResult(await vm.agent.info.$get());
  } catch (error) {
    const failure = classifyAgentError(error);

    return {
      reachable: false,
      // A blocked guest-exec is reported by the agent, so reaching this branch
      // with that status means the whole endpoint was refused, not the command.
      execAvailable: failure.status === "exec_disabled" ? false : null,
      version: null,
      failure,
    };
  }

  if (typeof info !== "object" || info === null) {
    return {
      reachable: true,
      execAvailable: null,
      version: null,
      failure: null,
    };
  }

  const { version, supported_commands: supported } = info as {
    version?: unknown;
    supported_commands?: unknown;
  };

  return {
    reachable: true,
    execAvailable: Array.isArray(supported)
      ? supported.some(
          (command: SupportedCommand) =>
            command?.name === EXEC_COMMAND && Boolean(command.enabled),
        )
      : null,
    version: typeof version === "string" ? version : null,
    failure: null,
  };
};
