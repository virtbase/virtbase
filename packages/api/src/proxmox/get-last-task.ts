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

import { PROXMOX_TASK_STATUS_MAPPING } from "@virtbase/utils";
import type { getProxmoxInstance } from "./get-proxmox-instance";

export const getLastTask = async (
  instance: ReturnType<typeof getProxmoxInstance>,
  vmid: number,
) => {
  try {
    const taskList = await instance.node.tasks.$get({
      vmid,
      limit: 3,
      source: "active",
      errors: false,
    });
    return (
      taskList
        .filter((task) => task.type in PROXMOX_TASK_STATUS_MAPPING)
        .filter((task) => task.status === "RUNNING")
        .at(0) ?? null
    );
  } catch {
    // ignored: no task status available
    return null;
  }
};
