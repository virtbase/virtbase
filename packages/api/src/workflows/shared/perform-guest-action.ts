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

import type { GetProxmoxInstanceParams } from "../../proxmox";
import { getProxmoxInstance, performPowerAction } from "../../proxmox";

type PerformGuestActionStepParams = {
  proxmoxNode: GetProxmoxInstanceParams;
  vmid: number;
  action:
    | "start"
    | "stop"
    | "pause"
    | "resume"
    | "suspend"
    | "reset"
    | "reboot"
    | "shutdown";
};

type GuestAction = PerformGuestActionStepParams["action"];

export async function performGuestActionStep({
  proxmoxNode,
  vmid,
  action,
}: PerformGuestActionStepParams) {
  "use step";

  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  const upid = await performPowerAction({
    vm,
    action,
  });

  return {
    upid,
  };
}

const reversedActionsMap = {
  start: "stop",
  stop: "start",
  shutdown: "start",
  pause: "resume",
  resume: "pause",
  suspend: "resume",
  // Special cases that cannot be reversed
  reboot: null,
  reset: null,
} satisfies Record<GuestAction, GuestAction | null>;

export async function rollbackPerformGuestActionStep({
  proxmoxNode,
  vmid,
  initialAction,
  upid,
}: Pick<PerformGuestActionStepParams, "proxmoxNode" | "vmid"> & {
  initialAction: GuestAction;
  upid: string;
}): Promise<{ upid: string | null }> {
  "use step";

  const instance = getProxmoxInstance(proxmoxNode);
  const node = instance.node;
  const vm = instance.node.qemu.$(vmid);

  const task = await node.tasks.$(upid).status.$get();
  if (task.status === "running") {
    // The task is still running, the guest has not been actioned completely yet.
    // Just delete the task and nothing will be done.
    await node.tasks.$(upid).$delete();
  } else {
    if (task.status === "stopped" && task.exitstatus === "OK") {
      // The task has been completed successfully and the guest has been actioned.
      const reversedAction = reversedActionsMap[initialAction];

      if (null === reversedAction) {
        // Special case, cannot be reversed
        return {
          upid: null,
        };
      }

      const upid = await performPowerAction({
        vm,
        action: reversedAction,
      });

      return {
        upid,
      };
    }
  }

  // The task is stopped but it failed or any other status
  // Do nothing.
  return {
    upid: null,
  };
}
