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

import {
  ProxmoxApiError,
  ProxmoxAuthenticationError,
  ProxmoxParameterError,
  ProxmoxPermissionError,
} from "@virtbase/proxmox-api";

/**
 * The error `@virtbase/proxmox-api` throws when Proxmox answers `status`, for
 * a stub to reject with.
 *
 * Uses the client's own classes - including the subclass it picks for 400,
 * 401 and 403 - so code under test sees what it sees in production rather
 * than a hand-written copy of the message, which is what went stale when the
 * client moved from plain errors to typed ones.
 *
 * @param reason Proxmox's own explanation, as PVE 9 sends it in the body.
 */
export const proxmoxApiError = (
  status: number,
  reason: string,
  { method = "GET", path = "/api2/json/nodes/n1/qemu/100/agent/info" } = {},
): ProxmoxApiError => {
  const details = {
    status,
    statusText: reason,
    reason,
    body: { data: null, message: `${reason}\n` },
    request: {
      method,
      path,
      pathTemplate: path,
      origin: "https://node.example:443",
      attempt: 1,
    },
  };

  switch (status) {
    case 400:
      return new ProxmoxParameterError(details);
    case 401:
      return new ProxmoxAuthenticationError(details);
    case 403:
      return new ProxmoxPermissionError(details);
    default:
      return new ProxmoxApiError(details);
  }
};
