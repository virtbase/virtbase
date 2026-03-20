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

import type { Proxmox } from "proxmox-api";
import { ProxmoxServerStatus } from "../constants";

export const mapProxmoxServerStatus = (
  currentStatus: Proxmox.nodesQemuStatusCurrentVmStatus,
): ProxmoxServerStatus => {
  const { status, qmpstatus, lock } = currentStatus;
  if (status === "running" && qmpstatus === "running" && !lock) {
    return ProxmoxServerStatus.RUNNING;
  }

  if (status === "stopped" && qmpstatus === "stopped" && !lock) {
    return ProxmoxServerStatus.STOPPED;
  }

  if (status === "running" && qmpstatus === "paused" && !lock) {
    return ProxmoxServerStatus.PAUSED;
  }

  if (status === "stopped" && qmpstatus === "stopped" && lock === "suspended") {
    return ProxmoxServerStatus.SUSPENDED;
  }

  return ProxmoxServerStatus.UNKNOWN;
};
