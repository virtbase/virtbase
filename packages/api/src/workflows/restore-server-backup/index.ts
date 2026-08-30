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

import { sleep } from "workflow";
// Imported from the leaf rather than the `guest-os` barrel: that barrel
// reaches Redis and therefore `node:crypto`, which a workflow cannot load.
import { CLEARED_OPERATING_SYSTEM } from "../../guest-os/columns";
import type { GetProxmoxInstanceParams } from "../../proxmox";
import {
  applyGuestConfigStep,
  rollbackApplyGuestConfigStep,
} from "../shared/apply-guest-config";
import { destroyGuestStep } from "../shared/destroy-guest";
import { getGuestConfigStep } from "../shared/get-guest-config";
import { moveDiskStep } from "../shared/move-disk";
import {
  performGuestActionStep,
  rollbackPerformGuestActionStep,
} from "../shared/perform-guest-action";
import { resizeDiskStep } from "../shared/resize-disk";
import { runRollbacks } from "../shared/run-rollbacks";
import { updateServerStep } from "../shared/update-server";
import { waitForProxmoxTaskStep } from "../shared/wait-for-proxmox-task";
import { restoreBackupStep, rollbackRestoreBackupStep } from "./restore-backup";

type RestoreServerBackupWorkflowParams = {
  proxmoxNode: GetProxmoxInstanceParams;
  vmid: number;
  volid: string;
  proxmoxTemplateId: string | null;
  currentProxmoxTemplateId: string | null;
  serverId: string;
};

/**
 * Restore a backup onto an existing server by:
 *   1. restoring the backup into a brand-new temporary guest,
 *   2. detaching the original guest's primary disk, and
 *   3. swapping in the restored disk via `moveDiskStep`.
 *
 * This preserves the original guest's configuration (cloud-init, network,
 * hardware, hookscript, ...) — the restore only replaces the disk contents.
 *
 * Mirrors the disk-swap pattern used by the change-template workflow, with one
 * deliberate difference: there, destroying the disk that was swapped out is the
 * point - the customer asked for a different operating system. Here it is the
 * customer's live data, and a restore that fails must not have eaten it.
 *
 * [!] The customer's pre-restore volume is destroyed in exactly one place,
 * step 8, and only after step 7 has watched the restored disk boot. Until then
 * it sits at `unused0`, and every compensation in the stack either leaves it
 * there or puts it straight back on `scsi0`. Fail anywhere before step 8 and
 * the customer keeps their data; the worst outcome is a restored volume
 * orphaned on the storage.
 */
export async function restoreServerBackupWorkflow({
  proxmoxNode,
  vmid,
  volid,
  proxmoxTemplateId,
  currentProxmoxTemplateId,
  serverId,
}: RestoreServerBackupWorkflowParams) {
  "use workflow";

  const rollbacks: Array<() => Promise<void>> = [];

  try {
    // 0. Mark the server as installing so the customer can't issue further
    //    actions while we operate on it.
    await updateServerStep({
      serverId,
      data: {
        installedAt: null,
        // The disk is about to be replaced, so whatever operating system was
        // detected on it is known to be wrong rather than merely old - the one
        // case where forgetting it beats keeping it. The display falls back to
        // the template until the rebuilt guest announces itself.
        ...CLEARED_OPERATING_SYSTEM,
      },
    });

    rollbacks.push(() =>
      updateServerStep({
        serverId,
        data: {
          installedAt: new Date(),
        },
      }),
    );

    // 1. Stop the original guest. The disk we're going to detach must not
    //    be in use.
    const { upid: stopUpid } = await performGuestActionStep({
      proxmoxNode,
      vmid,
      action: "stop",
    });

    if (null !== stopUpid) {
      await sleep("5s");
      await waitForProxmoxTaskStep({
        proxmoxNode,
        upid: stopUpid,
        ignoreErrors: false,
      });
    }

    rollbacks.push(async () => {
      const { upid: startUpid } = await rollbackPerformGuestActionStep({
        proxmoxNode,
        vmid,
        initialAction: "stop",
        upid: stopUpid,
      });
      if (null !== startUpid) {
        await waitForProxmoxTaskStep({
          proxmoxNode,
          upid: startUpid,
          ignoreErrors: true,
        });
      }
    });

    // 2. Capture the original disk size so we can resize the restored disk
    //    back to it after the move (preserves any customer-initiated
    //    upgrade that happened after the backup was taken).
    const { config: originalConfig } = await getGuestConfigStep({
      proxmoxNode,
      vmid,
      current: true,
    });
    const originalDiskSizeMatch = originalConfig.scsi0?.match(/size=(\d+)G/);
    const originalDiskSize = originalDiskSizeMatch
      ? Number(originalDiskSizeMatch[1])
      : null;

    // 3. Restore the backup into a NEW temporary guest. This is the
    //    expensive step — it copies the entire backup archive to disk.
    const { tempVmid, restoreUpid } = await restoreBackupStep({
      proxmoxNode,
      originalVmid: vmid,
      volid,
    });

    await sleep("30s");
    await waitForProxmoxTaskStep({
      proxmoxNode,
      upid: restoreUpid,
      ignoreErrors: false,
    });

    rollbacks.push(() =>
      rollbackRestoreBackupStep({
        proxmoxNode,
        tempVmid,
        restoreUpid,
      }),
    );

    // 4. Detach `scsi0` from the original guest. Proxmox moves the old
    //    volume to `unused0`, where it stays - untouched and re-attachable -
    //    until step 8 proves the restored disk boots. We capture
    //    `previousConfig` so the volume can be put back where it was.
    const { previousConfig, addedKeys } = await applyGuestConfigStep({
      proxmoxNode,
      vmid,
      mode: "sync",
      config: {
        delete: "scsi0",
      },
    });

    // Only safe to use BEFORE step 5 completes: once the restored disk
    // occupies `scsi0`, re-applying the old `scsi0` value would clash. We swap
    // this entry for `swapBackOriginalDiskRollback` as soon as the move
    // succeeds.
    const restorePreMoveConfigRollback = async () => {
      await rollbackApplyGuestConfigStep({
        proxmoxNode,
        vmid,
        previousConfig,
        addedKeys,
        mode: "sync",
      });
    };
    rollbacks.push(restorePreMoveConfigRollback);

    // The post-move compensation: free the `scsi0` slot again (the restored
    // disk drops to the next `unusedN`) and re-attach the customer's own
    // volume in its place. Valid from the moment the move lands until step 8
    // destroys the original - which is exactly the window in which the
    // customer's data still exists and the restored disk is not yet proven.
    const swapBackOriginalDiskRollback = async () => {
      await applyGuestConfigStep({
        proxmoxNode,
        vmid,
        mode: "sync",
        config: {
          delete: "scsi0",
        },
      });

      await rollbackApplyGuestConfigStep({
        proxmoxNode,
        vmid,
        previousConfig,
        addedKeys,
        mode: "sync",
      });
    };

    // 5. Move the restored disk from the temporary guest into the original
    //    guest's freed `scsi0` slot.
    const { upid: moveUpid } = await moveDiskStep({
      proxmoxNode,
      vmid: tempVmid,
      disk: "scsi0",
      "target-vmid": vmid,
      "target-disk": "scsi0",
      bwlimit: 0,
      // Remove the disk from the temporary guest after the move so we
      // don't leak storage on the temp VM if the post-move steps fail.
      delete: true,
    });

    await sleep("3s");
    await waitForProxmoxTaskStep({
      proxmoxNode,
      upid: moveUpid,
      ignoreErrors: false,
    });

    // Past the point of no return for the pre-move rollback: `scsi0` is
    // occupied now, so putting the original back means detaching the restored
    // disk first. Swap the one compensation for the other.
    const preMoveRollbackIndex = rollbacks.indexOf(
      restorePreMoveConfigRollback,
    );
    if (preMoveRollbackIndex !== -1) {
      rollbacks.splice(preMoveRollbackIndex, 1);
    }
    rollbacks.push(swapBackOriginalDiskRollback);

    // 6. Resize the restored disk back to the original size. The backup's
    //    disk may be smaller than what the customer is currently paying for
    //    (they could have upgraded after the backup was taken).
    //
    //    [!] No `rollbackResizeDiskStep` is pushed here, deliberately. That
    //    step detaches `scsi0` - which, between the move and step 8, is the
    //    restored disk sitting in front of a guest whose only other volume is
    //    the customer's original at `unused0`. Running it would leave the
    //    server with no boot disk at all. `swapBackOriginalDiskRollback`
    //    already discards the restored disk wholesale, resized or not, so the
    //    resize needs no compensation of its own.
    if (originalDiskSize && Number.isFinite(originalDiskSize)) {
      const { resizeUpid } = await resizeDiskStep({
        proxmoxNode,
        vmid,
        disk: "scsi0",
        size: originalDiskSize,
      });

      if (resizeUpid) {
        await waitForProxmoxTaskStep({
          proxmoxNode,
          upid: resizeUpid,
          ignoreErrors: false,
        });
      }
    }

    // 7. Start the original guest on the restored disk. We wait for the start
    //    task so a broken backup surfaces here (workflow fails -> rollbacks
    //    run, and the customer's own volume is still at `unused0` to go back
    //    to) rather than leaving the customer with a server they cannot boot.
    const { upid: startUpid } = await performGuestActionStep({
      proxmoxNode,
      vmid,
      action: "start",
    });

    if (null !== startUpid) {
      await waitForProxmoxTaskStep({
        proxmoxNode,
        upid: startUpid,
        ignoreErrors: false,
      });
    }

    // The restored disk has demonstrably booted. Going back to the original
    // is no longer the right answer - and step 8 is about to make it
    // impossible - so drop that compensation before it can run against a
    // volume that no longer exists.
    const swapBackRollbackIndex = rollbacks.indexOf(
      swapBackOriginalDiskRollback,
    );
    if (swapBackRollbackIndex !== -1) {
      rollbacks.splice(swapBackRollbackIndex, 1);
    }

    rollbacks.push(async () => {
      const { upid: rollbackStartUpid } = await rollbackPerformGuestActionStep({
        proxmoxNode,
        vmid,
        initialAction: "start",
        upid: startUpid,
      });
      if (null !== rollbackStartUpid) {
        await waitForProxmoxTaskStep({
          proxmoxNode,
          upid: rollbackStartUpid,
          ignoreErrors: true,
        });
      }
    });

    // 8. Destroy the customer's pre-restore volume, still sitting at
    //    `unused0` since step 4. This is the one irreversible act in the
    //    workflow, and it happens only now: the restored disk has been moved
    //    in, resized and booted. Everything before this point leaves the
    //    original recoverable.
    await applyGuestConfigStep({
      proxmoxNode,
      vmid,
      mode: "sync",
      config: {
        delete: "unused0",
      },
    });

    // 9. Mark the server installed and switch the recorded template to the
    //    backup's template (if any).
    await updateServerStep({
      serverId,
      data: {
        installedAt: new Date(),
        proxmoxTemplateId,
      },
    });

    rollbacks.push(() =>
      updateServerStep({
        serverId,
        data: {
          installedAt: null,
          proxmoxTemplateId: currentProxmoxTemplateId,
        },
      }),
    );

    // TODO: Optionally send email to the user that the backup has been restored

    // Best-effort: destroy the (now empty) temporary guest. Failure here
    // doesn't leave the customer in a broken state — the temp VM has no
    // disks attached after step 5 — so we just warn and move on.
    try {
      await destroyGuestStep({
        proxmoxNode,
        vmid: tempVmid,
      });
    } catch (error) {
      console.warn(
        "[@virtbase/api] Failed to destroy temporary guest after successful backup restore:",
        error,
      );
    }
  } catch (error) {
    // Every compensation is attempted, even if an earlier one throws - see
    // `runRollbacks`. The original error is what the caller gets.
    await runRollbacks(rollbacks, "restoreServerBackupWorkflow");
    throw error;
  }
}
