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

import type { GetProxmoxInstanceParams, ProxmoxInstance } from "../../proxmox";
import { getProxmoxInstance } from "../../proxmox";

type CloneGuestStepParams = {
  proxmoxNode: GetProxmoxInstanceParams;
  // Proxmox parameters
  vmid: number;
  newid?: number;
  options?: Omit<
    Parameters<
      ReturnType<ProxmoxInstance["node"]["qemu"]["$"]>["clone"]["$post"]
    >[0],
    "newid"
  >;
};

export async function cloneGuestStep({
  proxmoxNode,
  vmid,
  newid,
  options = {},
}: CloneGuestStepParams) {
  "use step";

  const { node, cluster } = getProxmoxInstance(proxmoxNode);

  const nextId = await cluster.nextid.$get({
    vmid: newid,
  });

  const defaultName =
    process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
      ? `vb${nextId}`
      : process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
        ? `vb-staging${nextId}`
        : `vb-dev${nextId}`;
  const cloneUpid = await node.qemu.$(vmid).clone.$post({
    newid: nextId,
    bwlimit: 0,
    full: true,
    name: defaultName,
    ...options,
  });

  return {
    clonedVmid: nextId,
    clonedName: options.name ?? defaultName,
    cloneUpid,
  };
}

export async function rollbackCloneGuestStep({
  proxmoxNode,
  newid,
  cloneUpid,
}: Pick<CloneGuestStepParams, "proxmoxNode"> & {
  newid: number;
  cloneUpid: string;
}) {
  "use step";

  const { node } = getProxmoxInstance(proxmoxNode);

  const task = await node.tasks.$(cloneUpid).status.$get();
  if (task.status === "running") {
    // The task is still running, the guest has not been cloned completely yet.
    // Just delete the task and nothing will be created.
    await node.tasks.$(cloneUpid).$delete();
  } else {
    if (task.status === "stopped" && task.exitstatus === "OK") {
      // The task has been completed successfully and the guest has been cloned.
      // Delete the guest.
      await node.qemu.$(newid).$delete({
        "destroy-unreferenced-disks": true,
        purge: true,
      });
    }
  }

  // The task is stopped but it failed or any other status
  // Do nothing.
}
