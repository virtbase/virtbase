/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { ProxmoxError } from "@virtbase/proxmox-api";
import type { GuestAgentFailure } from "./types.ts";

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

/**
 * The HTTP status Proxmox answered with, or `null` when there was no answer -
 * a refused connection, a timeout, an abort.
 *
 * `ProxmoxApiError` and its 400/401/403 subclasses carry it as `status`.
 * `isInstance` rather than `instanceof`, because the check has to hold for an
 * error thrown by another installed copy of the client.
 */
const extractStatus = (error: unknown): number | null => {
  if (!ProxmoxError.isInstance(error) || !("status" in error)) {
    return null;
  }

  return typeof error.status === "number" ? error.status : null;
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

  const status = extractStatus(error);

  if (status === 401 || status === 403) {
    return { status: "permission_denied", message };
  }

  if (status !== null && status >= 500) {
    return { status: "agent_unreachable", message };
  }

  return { status: "error", message };
};
