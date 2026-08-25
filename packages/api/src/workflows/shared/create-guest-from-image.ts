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
import { getProxmoxInstance } from "../../proxmox";

type CreateGuestFromImageStepParams = {
  proxmoxNode: GetProxmoxInstanceParams;
  /** The `import` volume to build the disk from, e.g. `cephfs:import/x.qcow2`. */
  volid: string;
  /** The storage the guest's disk is allocated on. */
  storage: string;
  /** Guest shape, from the template's metadata. */
  template: {
    ostype: string;
    cpuType: string;
    biosType: string;
    machine: string;
  };
  name?: string;
  description?: string;
};

/**
 * Creates a guest whose disk is imported directly from a template image.
 *
 * Replaces cloning a template VM. Measured on the dev cluster this is not the
 * slower path - 9s to import a 3 GiB Debian disk versus 11s to full-clone the
 * same disk - because the conversion is sparse-aware.
 *
 * `scsi0` uses Proxmox's required special syntax: `<storage>:0,import-from=...`
 * allocates a new volume and fills it from the source. Anything else is
 * rejected by `$check_drive_param`.
 */
export async function createGuestFromImageStep({
  proxmoxNode,
  volid,
  storage,
  template,
  name,
  description,
}: CreateGuestFromImageStepParams) {
  "use step";

  const { node, cluster } = getProxmoxInstance(proxmoxNode);

  const vmid = await cluster.nextid.$get({});

  const defaultName =
    process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
      ? `vb${vmid}`
      : process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
        ? `vb-staging${vmid}`
        : `vb-dev${vmid}`;

  const guestName = name ?? defaultName;

  const createUpid = await node.qemu.$post({
    vmid,
    name: guestName,
    ...(description ? { description } : {}),
    ostype: template.ostype as never,
    machine: template.machine,
    cpu: template.cpuType,
    bios: template.biosType as never,
    scsihw: "virtio-scsi-single",
    scsi0: `${storage}:0,import-from=${volid},discard=on,iothread=1,ssd=1,cache=writeback`,
    ide2: `${storage}:cloudinit`,
    boot: "order=scsi0",
    // Hardware beyond this is applied by `applyHardwareConfigStep`, which owns
    // the plan-derived values and can be rolled back independently.
  } as never);

  return {
    createdVmid: vmid,
    createdName: guestName,
    createUpid: createUpid as string,
  };
}

export async function rollbackCreateGuestFromImageStep({
  proxmoxNode,
  vmid,
  createUpid,
}: Pick<CreateGuestFromImageStepParams, "proxmoxNode"> & {
  vmid: number;
  createUpid: string;
}) {
  "use step";

  const { node } = getProxmoxInstance(proxmoxNode);

  const task = await node.tasks.$(createUpid).status.$get();

  if (task.status === "running") {
    // Still importing - stopping the task leaves nothing behind, because
    // Proxmox rolls back a failed create itself.
    await node.tasks.$(createUpid).$delete();
    return;
  }

  if (task.status === "stopped" && task.exitstatus === "OK") {
    await node.qemu.$(vmid).$delete({
      "destroy-unreferenced-disks": true,
      purge: true,
    });
  }

  // Stopped but failed: Proxmox already cleaned up after itself.
}
