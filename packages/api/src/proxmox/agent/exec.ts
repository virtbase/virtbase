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
import type { GuestCommandResult, ProxmoxVm } from "./types";

/**
 * How long the whole call may take, including the initial `exec`.
 *
 * Every command we run is expected to answer in well under a second; the budget
 * exists to bound the damage when one does not.
 */
const DEFAULT_TIMEOUT_MS = 6_000;

/**
 * Delay between `exec-status` polls. Each poll is a round trip to the node, so
 * this trades a little latency for a lot fewer requests.
 */
const DEFAULT_POLL_INTERVAL_MS = 400;

export interface RunGuestCommandOptions {
  /** Total budget in milliseconds. Defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Poll delay in milliseconds. Defaults to {@link DEFAULT_POLL_INTERVAL_MS}. */
  pollIntervalMs?: number;
  /** Written to the process' stdin. */
  input?: string;
}

/**
 * The raw `agent/exec-status` body.
 *
 * Proxmox documents `exited` and the `*-truncated` flags as booleans, but the
 * wire format is PVE's usual `0`/`1` integers, so everything here is coerced
 * rather than trusted.
 */
interface RawExecStatus {
  exited?: boolean | number;
  exitcode?: number;
  signal?: number;
  "out-data"?: string;
  "err-data"?: string;
  "out-truncated"?: boolean | number;
  "err-truncated"?: boolean | number;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs a command inside a guest through the QEMU guest agent.
 *
 * `agent/exec` only starts the process and hands back a pid, so the result has
 * to be collected by polling `agent/exec-status` until it reports the process
 * exited.
 *
 * Never throws: every failure - a missing agent, a blocked `guest-exec`, a
 * token without `VM.GuestAgent.Unrestricted` - comes back as a status the
 * caller can render. See {@link GuestAgentFailureStatus}.
 *
 * [!] `argv` must be built from constants. Interpolating customer input into a
 * command run as root inside their VM is remote code execution; when a value
 * genuinely has to vary, validate it and pass it as its own element rather than
 * concatenating it into a `sh -c` string.
 *
 * [!] Only run commands that terminate on their own. Timing out abandons the
 * process - the guest agent gives us no way to kill it - so a command that
 * blocks stays blocked in the customer's VM until they reboot.
 *
 * @param vm - The Proxmox VM accessor, i.e. `ctx.instance.vm`.
 * @param argv - Executable followed by its arguments.
 */
export const runGuestCommand = async (
  vm: ProxmoxVm,
  argv: readonly string[],
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    input,
  }: RunGuestCommandOptions = {},
): Promise<GuestCommandResult> => {
  if (argv.length === 0) {
    throw new Error("[runGuestCommand] argv must not be empty.");
  }

  const deadline = Date.now() + timeoutMs;

  let pid: number;
  try {
    const started = await vm.agent.exec.$post({
      command: [...argv],
      ...(input !== undefined && { "input-data": input }),
    });

    pid = started.pid;
  } catch (error) {
    return classifyAgentError(error);
  }

  while (true) {
    let status: RawExecStatus;
    try {
      status = (await vm.agent["exec-status"].$get({ pid })) as RawExecStatus;
    } catch (error) {
      return classifyAgentError(error);
    }

    if (status.exited) {
      return {
        status: "ok",
        // A process killed by a signal reports no exit code at all.
        exitCode: typeof status.exitcode === "number" ? status.exitcode : null,
        signal: typeof status.signal === "number" ? status.signal : null,
        stdout: status["out-data"] ?? "",
        stderr: status["err-data"] ?? "",
        truncated: Boolean(status["out-truncated"] || status["err-truncated"]),
      };
    }

    // Check after polling rather than before, so a command that finishes just
    // as the budget expires still yields its output.
    if (Date.now() + pollIntervalMs >= deadline) {
      return {
        status: "timeout",
        message: `[runGuestCommand] "${argv[0]}" did not finish within ${timeoutMs}ms.`,
      };
    }

    await sleep(pollIntervalMs);
  }
};
