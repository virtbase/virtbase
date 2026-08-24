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

import type { ProxmoxInstance } from "../get-proxmox-instance";

/**
 * The Proxmox VM accessor, i.e. `instance.node.qemu.$(vmid)`.
 *
 * Routers already carry one as `ctx.instance.vm`; background jobs build their
 * own from a bare instance.
 */
export type ProxmoxVm = ReturnType<ProxmoxInstance["node"]["qemu"]["$"]>;

/**
 * Why a guest agent call did not produce output.
 *
 * The guest agent is the one part of a server Virtbase does not control - the
 * customer can uninstall it, block individual commands, or simply stop the VM.
 * Every one of those is an expected state rather than an error, so agent
 * helpers return a status instead of throwing and the caller decides what to
 * render.
 *
 * - `agent_unreachable` - no agent is answering: not installed, not running,
 *   the VM is stopped, or the QMP command timed out.
 * - `exec_disabled` - the agent answers, but `guest-exec` is blocked (see
 *   `BLOCK_RPCS` in `/etc/default/qemu-guest-agent`) or too old to support it.
 * - `permission_denied` - the Proxmox API token lacks
 *   `VM.GuestAgent.Unrestricted`. An operator problem, never a customer one.
 * - `timeout` - the command was still running when our budget ran out.
 * - `error` - anything we could not classify.
 */
export type GuestAgentFailureStatus =
  | "agent_unreachable"
  | "exec_disabled"
  | "permission_denied"
  | "timeout"
  | "error";

export interface GuestAgentFailure {
  status: GuestAgentFailureStatus;
  /**
   * Developer-facing detail, for logs and Sentry.
   *
   * [!] Never rendered to a customer - it carries Proxmox internals such as
   * node hostnames and request URLs. The UI translates `status` instead.
   */
  message?: string;
}

export interface GuestCommandSuccess {
  status: "ok";
  /**
   * The process exit code, or `null` when it was terminated by a signal.
   *
   * A non-zero code is still a successful call: `ufw status` on a host without
   * ufw exits non-zero, and that is an answer, not a failure.
   */
  exitCode: number | null;
  /** The signal that terminated the process, or `null` if it exited normally. */
  signal: number | null;
  stdout: string;
  stderr: string;
  /** Whether Proxmox truncated either stream. */
  truncated: boolean;
}

export type GuestCommandResult = GuestCommandSuccess | GuestAgentFailure;

/**
 * Narrows a result to the successful branch.
 */
export const isGuestCommandSuccess = (
  result: GuestCommandResult,
): result is GuestCommandSuccess => result.status === "ok";
