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

import { mapProxmoxServerStatus, ProxmoxServerStatus } from "@virtbase/utils";
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

/**
 * For each guest action, the set of current states that make the action a
 * no-op. When the current state is in this set, we skip the action entirely
 * and return a null upid so callers can treat it as "nothing to do" instead
 * of hitting a Proxmox error like "VM is already running".
 */
const noopStatesMap: Record<GuestAction, readonly ProxmoxServerStatus[]> = {
  start: [ProxmoxServerStatus.RUNNING],
  resume: [ProxmoxServerStatus.RUNNING],
  stop: [ProxmoxServerStatus.STOPPED, ProxmoxServerStatus.SUSPENDED],
  shutdown: [ProxmoxServerStatus.STOPPED, ProxmoxServerStatus.SUSPENDED],
  pause: [ProxmoxServerStatus.PAUSED],
  suspend: [ProxmoxServerStatus.SUSPENDED],
  // `reset` and `reboot` don't have a trivially safe no-op state: rebooting a
  // stopped VM is clearly wrong, but that's a caller error rather than
  // something we silently swallow. Let Proxmox surface the failure.
  reset: [],
  reboot: [],
};

async function executePowerActionIfNeeded({
  proxmoxNode,
  vmid,
  action,
}: PerformGuestActionStepParams): Promise<{ upid: string | null }> {
  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  const currentStatus = await vm.status.current.$get();
  const state = mapProxmoxServerStatus(currentStatus);

  if (noopStatesMap[action].includes(state)) {
    // Guest is already in the desired state; nothing to do.
    return { upid: null };
  }

  const upid = await performPowerAction({ vm, action });
  return { upid };
}

export async function performGuestActionStep(
  params: PerformGuestActionStepParams,
): Promise<{ upid: string | null }> {
  "use step";

  return executePowerActionIfNeeded(params);
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
  /**
   * The UPID returned by the forward step. May be `null` if the forward step
   * was a no-op because the guest was already in the target state.
   */
  upid: string | null;
}): Promise<{ upid: string | null }> {
  "use step";

  // Forward step was a no-op — nothing to roll back.
  if (upid === null) {
    return { upid: null };
  }

  const instance = getProxmoxInstance(proxmoxNode);
  const node = instance.node;

  const task = await node.tasks.$(upid).status.$get();
  if (task.status === "running") {
    // The task is still running, the guest has not been actioned completely yet.
    // Just delete the task and nothing will be done.
    await node.tasks.$(upid).$delete();
    return { upid: null };
  }

  // The task finished but failed — no state change to undo.
  if (task.status !== "stopped" || task.exitstatus !== "OK") {
    return { upid: null };
  }

  const reversedAction = reversedActionsMap[initialAction];
  if (null === reversedAction) {
    // Special case, cannot be reversed
    return { upid: null };
  }

  // Re-use the same no-op check for the reverse action: if an external actor
  // already moved the guest into the state the rollback would produce, skip
  // the power action rather than erroring.
  return executePowerActionIfNeeded({
    proxmoxNode,
    vmid,
    action: reversedAction,
  });
}
