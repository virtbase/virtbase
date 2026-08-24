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

import type { ListeningSocket } from "@virtbase/utils";
import { parseListeningSockets } from "@virtbase/utils";
import type { GuestAgentFailure, ProxmoxVm } from "../proxmox/agent";
import { runGuestCommand } from "../proxmox/agent";
import { LISTENING_SOCKETS_SCRIPT, shell } from "./commands";

export type ListeningSocketsResult =
  | { status: "ok"; sockets: ListeningSocket[] }
  // Nested rather than spread - the failure carries its own `status`.
  | { status: "failed"; failure: GuestAgentFailure };

/**
 * Reads the sockets a server is listening on.
 *
 * This is the ground truth the open-port feature is built on, and the reason it
 * beats scanning from outside: the bind address is visible here, so a database
 * on `127.0.0.1` can be told apart from the same database on `0.0.0.0` - a
 * distinction no port scan can make.
 */
export const readListeningSockets = async (
  vm: ProxmoxVm,
): Promise<ListeningSocketsResult> => {
  const result = await runGuestCommand(vm, shell(LISTENING_SOCKETS_SCRIPT));

  if (result.status !== "ok") {
    return { status: "failed", failure: result };
  }

  return { status: "ok", sockets: parseListeningSockets(result.stdout) };
};
