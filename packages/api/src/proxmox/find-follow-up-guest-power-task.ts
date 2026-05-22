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
import type { ProxmoxInstance } from "./get-proxmox-instance";

/**
 * Proxmox HA task types issued by `POST /nodes/{node}/qemu/{vmid}/status/*`
 * when the VM is HA-managed. These tasks only acknowledge the HA stack
 * request and finish in well under a second — they are **not** the tasks
 * that actually start/stop the guest.
 */
export const HA_POWER_TASK_TYPES = ["hastart", "hastop"] as const;

/**
 * Proxmox QEMU task types that perform the actual guest power transition.
 * For HA-managed VMs, one of these tasks is created by the CRM/LRM 1-2
 * seconds (occasionally up to ~20 seconds) after the matching `ha*` task
 * completes.
 */
export const GUEST_POWER_TASK_TYPES = [
  "qmstart",
  "qmstop",
  "qmshutdown",
  "qmreboot",
  "qmreset",
  "qmresume",
  "qmpause",
  "qmsuspend",
] as const;

export const isHaPowerTask = (task: { type: string }): boolean =>
  (HA_POWER_TASK_TYPES as readonly string[]).includes(task.type);

export const isGuestPowerTask = (task: { type: string }): boolean =>
  (GUEST_POWER_TASK_TYPES as readonly string[]).includes(task.type);

interface FindFollowUpGuestPowerTaskOptions {
  /**
   * Only consider tasks whose `starttime` (in seconds, Proxmox convention) is
   * greater than or equal to this value. Use the HA task's `starttime` to
   * avoid matching an unrelated `qm*` task that ran before the current HA
   * operation was even issued.
   */
  sinceStarttime?: number;
}

/**
 * Find the QEMU guest power task that follows an HA-managed power operation.
 *
 * When the API returns a `hastart`/`hastop` UPID, that task completes quickly
 * once the HA stack acknowledges the request. The actual `qmstart`/`qmstop`/
 * `qmshutdown`/... task is created separately ~1-2s (occasionally up to ~20s
 * — see CRM/LRM polling loop) later. There is no UPID linking between the
 * two tasks, so we have to poll the task list filtered by `vmid` to find it.
 *
 * @see https://forum.proxmox.com/threads/best-way-to-wait-for-end-stop-vm-task-using-ha.163278/
 * @see https://bugzilla.proxmox.com/show_bug.cgi?id=6220
 */
export const findFollowUpGuestPowerTask = async (
  instance: ProxmoxInstance,
  vmid: number,
  { sinceStarttime }: FindFollowUpGuestPowerTaskOptions = {},
): Promise<Proxmox.nodesTasksNodeTasks | null> => {
  const tasks = await instance.node.tasks.$get({
    vmid,
    limit: 10,
    // `active` would not include the freshly-finished HA task we want to skip
    // past, but the guest power task itself is what we are after and may
    // already be running by the time we poll — `all` covers both cases.
    source: "all",
    errors: false,
  });

  return (
    tasks
      .filter(isGuestPowerTask)
      .filter(
        (task) => sinceStarttime == null || task.starttime >= sinceStarttime,
      )
      // Most-recent first so we follow the newest matching task.
      .sort((a, b) => b.starttime - a.starttime)
      .at(0) ?? null
  );
};
