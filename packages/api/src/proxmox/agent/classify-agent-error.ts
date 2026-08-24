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

import type { GuestAgentFailure } from "./types";

/**
 * `proxmox-api` throws a plain `Error` whose message is the only carrier of the
 * HTTP status - there is no `status` field to branch on. The two shapes are:
 *
 *   `GET <url> return Error 500 <statusText>: {"errors":...}`          (400/401/500)
 *   `GET <url> connection failed with 403 Forbidden return: {...}`     (everything else)
 *
 * plus `FaILED to call <method> <url> cause by:<reason>` for transport
 * failures, which never carries a status at all.
 *
 * @see https://github.com/EmilienLeroy/proxmox-api `ProxmoxEngine.doRequest`
 */
const STATUS_PATTERN = /return Error (\d{3})|connection failed with (\d{3})/;

/**
 * QEMU guest agent replies that mean the agent is there but the command is not
 * available to us. QGA emits the first when a command is listed in
 * `BLOCK_RPCS`, the second when the agent predates the command entirely; both
 * leave us equally unable to run anything.
 */
const EXEC_DISABLED_PATTERNS = [
  "has been disabled for this instance",
  "has not been found",
];

const extractStatus = (message: string): number | null => {
  const match = STATUS_PATTERN.exec(message);
  if (!match) {
    return null;
  }

  const status = match[1] ?? match[2];

  return status ? Number.parseInt(status, 10) : null;
};

/**
 * Maps a thrown Proxmox error onto a guest agent failure.
 *
 * Classification is deliberately coarse. A 5xx from an agent endpoint has many
 * possible causes - "No QEMU guest agent configured", "QEMU guest agent is not
 * running", "VM 100 is not running", "qmp command 'guest-ping' failed - got
 * timeout" - but every one of them means the same thing to the customer: the
 * agent is not answering. Only the blocked-command case is worth separating,
 * because it is the one the customer fixes differently.
 */
export const classifyAgentError = (error: unknown): GuestAgentFailure => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error);

  if (EXEC_DISABLED_PATTERNS.some((pattern) => message.includes(pattern))) {
    return { status: "exec_disabled", message };
  }

  const status = extractStatus(message);

  if (status === 401 || status === 403) {
    return { status: "permission_denied", message };
  }

  if (status !== null && status >= 500) {
    return { status: "agent_unreachable", message };
  }

  return { status: "error", message };
};
