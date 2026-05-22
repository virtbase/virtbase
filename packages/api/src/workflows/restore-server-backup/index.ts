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
import { resizeDiskStep, rollbackResizeDiskStep } from "../shared/resize-disk";
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
 * Mirrors the disk-swap pattern used by the change-template workflow.
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
    //    volume to `unused0`. We capture `previousConfig` so we can
    //    re-attach the old disk if anything between here and step 5 fails.
    const { previousConfig, addedKeys } = await applyGuestConfigStep({
      proxmoxNode,
      vmid,
      mode: "sync",
      config: {
        delete: "scsi0",
      },
    });

    // Only safe to use BEFORE step 5 completes: once the new disk occupies
    // `scsi0`, re-applying the old `scsi0` value would clash. We pop this
    // entry as soon as the move succeeds.
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

    // Past the point of no return for the pre-move rollback.
    const preMoveRollbackIndex = rollbacks.indexOf(
      restorePreMoveConfigRollback,
    );
    if (preMoveRollbackIndex !== -1) {
      rollbacks.splice(preMoveRollbackIndex, 1);
    }

    // 6. Resize the restored disk back to the original size. The backup's
    //    disk may be smaller than what the customer is currently paying for
    //    (they could have upgraded after the backup was taken).
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

        rollbacks.push(() =>
          rollbackResizeDiskStep({
            proxmoxNode,
            vmid,
            disk: "scsi0",
            resizeUpid,
          }),
        );
      }
    }

    // 7. Delete the customer's previous disk that is now sitting at
    //    `unused0` after step 4.
    await applyGuestConfigStep({
      proxmoxNode,
      vmid,
      mode: "sync",
      config: {
        delete: "unused0",
      },
    });

    // 8. Start the original guest. We wait for the start task so a broken
    //    backup surfaces here (workflow fails -> rollbacks run) rather than
    //    leaving the customer with a server they cannot boot.
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
    for (const rollback of rollbacks.reverse()) {
      await rollback();
    }
    throw error;
  }
}
