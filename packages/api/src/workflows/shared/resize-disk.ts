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

import { FatalError } from "workflow";
import type { GetProxmoxInstanceParams } from "../../proxmox";
import { getProxmoxInstance } from "../../proxmox";

type ResizeDiskStepParams = {
  proxmoxNode: GetProxmoxInstanceParams;
  vmid: number;
  size: number;
  disk?: "scsi0" | "scsi1" | "scsi2" | "scsi3";
};

export async function resizeDiskStep({
  proxmoxNode,
  vmid,
  size,
  disk = "scsi0",
}: ResizeDiskStepParams) {
  "use step";

  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  const current = await vm.config.$get();
  if (!current[disk]) {
    throw new FatalError(
      `Disk ${disk} does not exist on guest ${vmid}. Cannot resize disk.`,
    );
  }

  const currentSizeString = current[disk].match(/size=(\d+)G/)?.[1];
  const currentSize = Number(currentSizeString);
  if (currentSize && !Number.isNaN(currentSize)) {
    // The disk size is already defined and a valid number
    if (currentSize === size) {
      // The disk is has already the requested size. Do nothing.
      console.info(
        `Disk ${disk} of guest ${vmid} is already at the requested size (${currentSize}G). Skipping resize.`,
      );
      return {
        resizeUpid: null,
        oldSize: currentSize,
      };
    }

    if (currentSize > size) {
      throw new FatalError(
        `Disk ${disk} of guest ${vmid} is already larger than the requested size (${currentSize}G > ${size}G). Cannot resize disk.`,
      );
    }
  }

  // The disk size is not defined or within the allowed range. Resize the disk.

  const resizeUpid = await vm.resize.$put({
    disk: "scsi0",
    size: `${size}G`,
  });

  return {
    resizeUpid,
    oldSize: currentSize,
  };
}

/**
 * WARNING:
 * This step will destroy the disk and recreate it with the original size.
 * Any data on the disk will be lost.
 */
export async function rollbackResizeDiskStep({
  proxmoxNode,
  vmid,
  disk = "scsi0",
  resizeUpid,
  oldSize,
}: Pick<ResizeDiskStepParams, "proxmoxNode"> & {
  vmid: number;
  disk?: "scsi0" | "scsi1" | "scsi2" | "scsi3";
  resizeUpid: string;
  oldSize: number;
}) {
  "use step";

  const instance = getProxmoxInstance(proxmoxNode);
  const node = instance.node;
  const vm = instance.node.qemu.$(vmid);

  const task = await node.tasks.$(resizeUpid).status.$get();
  if (task.status === "running") {
    // The task is still running, the disk has not been resized completely yet.
    // Just delete the task and nothing will be created.
    await node.tasks.$(resizeUpid).$delete();
  } else {
    if (task.status === "stopped" && task.exitstatus === "OK") {
      // The task has been completed successfully and the disk has been resized.
      // Recreate the disk with the original size.

      // Use $put for synchronous update
      await vm.config.$put({
        delete: disk,
      });

      // Use $put for synchronous update
      await vm.config.$put({
        [disk]: `size=${oldSize}G`,
      });
    }
  }

  // The task is stopped but it failed or any other status
  // Do nothing.
}
