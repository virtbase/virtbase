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

type RestoreBackupStepParams = {
  proxmoxNode: GetProxmoxInstanceParams;
  /**
   * Vmid of the original guest. Only used to give the temporary guest a
   * recognisable name/description; the temp guest is created at a fresh
   * vmid chosen via `/cluster/nextid`.
   */
  originalVmid: number;
  /**
   * The backup volume id to restore (e.g. `backups:backup/...`).
   */
  volid: string;
};

/**
 * Restore a backup into a brand-new temporary guest at a freshly-allocated
 * vmid. The original guest is left untouched, so downstream steps can swap
 * the restored disk in via `moveDiskStep` without losing any user-level
 * configuration on the original guest.
 */
export async function restoreBackupStep({
  proxmoxNode,
  originalVmid,
  volid,
}: RestoreBackupStepParams) {
  "use step";

  const { node, cluster } = getProxmoxInstance(proxmoxNode);

  const tempVmid = await cluster.nextid.$get({});

  // No `force: true` here — we want to create a NEW VM at `tempVmid`.
  const restoreUpid = await node.qemu.$post({
    vmid: tempVmid,
    archive: volid,
    name: `temp-restore-${originalVmid}`,
    description: `Temporary guest for backup restore of ${originalVmid}`,
    bwlimit: 0,
  });

  return {
    tempVmid,
    restoreUpid,
  };
}

/**
 * Roll back {@link restoreBackupStep}: kill the restore task if it's still
 * running, otherwise destroy the temporary guest that was created. Mirrors
 * the pattern used by `rollbackCloneGuestStep`.
 */
export async function rollbackRestoreBackupStep({
  proxmoxNode,
  tempVmid,
  restoreUpid,
}: Pick<RestoreBackupStepParams, "proxmoxNode"> & {
  tempVmid: number;
  restoreUpid: string;
}) {
  "use step";

  const { node } = getProxmoxInstance(proxmoxNode);

  const task = await node.tasks.$(restoreUpid).status.$get();
  if (task.status === "running") {
    // Restore still in progress — kill the task; nothing has been allocated
    // beyond the queued worker.
    await node.tasks.$(restoreUpid).$delete();
    return;
  }

  if (task.status === "stopped" && task.exitstatus === "OK") {
    // Restore succeeded — the temporary guest exists with restored disks
    // attached; destroy it (including its disks).
    await node.qemu.$(tempVmid).$delete({
      "destroy-unreferenced-disks": true,
      purge: true,
    });
  }

  // Task is stopped but failed (or any other terminal state) — nothing was
  // created, so there's nothing to undo.
}
