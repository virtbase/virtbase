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

import type { WebSocketData } from "@virtbase/validators";

type LogContext = Pick<WebSocketData, "serverId" | "userId" | "node" | "vmid">;

/**
 * The proxy's only way to write a log line.
 *
 * Callers may hand over a whole console payload: only these four fields are
 * read out of it, so the tickets it also carries never reach the log.
 */
export const log = (
  level: "info" | "warn" | "error",
  message: string,
  context?: LogContext,
): void => {
  if (!context) {
    console[level](message);
    return;
  }

  const { serverId, userId, node, vmid } = context;
  console[level](
    `${message} (server=${serverId} user=${userId} node=${node} vmid=${vmid})`,
  );
};
