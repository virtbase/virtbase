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
import type { GetProxmoxInstanceParams } from "../../proxmox/get-proxmox-instance";
import { applyCloudInitStep } from "../shared/apply-cloud-init";
import {
  applyGuestConfigStep,
  rollbackApplyGuestConfigStep,
} from "../shared/apply-guest-config";
import {
  createGuestFromImageStep,
  rollbackCreateGuestFromImageStep,
} from "../shared/create-guest-from-image";
import { destroyGuestStep } from "../shared/destroy-guest";
import { getTemplateStep } from "../shared/get-template";
import { moveDiskStep } from "../shared/move-disk";
import {
  performGuestActionStep,
  rollbackPerformGuestActionStep,
} from "../shared/perform-guest-action";
import { regenerateCloudInitStep } from "../shared/regenerate-cloud-init";
import { resizeDiskStep, rollbackResizeDiskStep } from "../shared/resize-disk";
import { updateServerStep } from "../shared/update-server";
import { waitForProxmoxTaskStep } from "../shared/wait-for-proxmox-task";

type ChangeTempalateWorkflowParams = {
  /**
   * The new initial root password for the server
   * after the template change.
   */
  initialRootPassword: string;
  /**
   * The Proxmox node where the server is located.
   */
  proxmoxNode: GetProxmoxInstanceParams & {
    id: string;
    importStorage: string;
    vmStorage: string;
    snippetStorage: string;
  };
  /**
   * The new template ID to use for the server.
   */
  proxmoxTemplateId: string;
  /**
   * The server ID to change the template for.
   */
  serverId: string;
  /**
   * The original disk size of the server as defined per the server plan.
   */
  size: number;
  /**
   * The Proxmox vmid of the server to change the template for.
   */
  vmid: number;
};

export async function changeTempalateWorkflow({
  initialRootPassword,
  proxmoxNode,
  proxmoxTemplateId,
  serverId,
  size,
  vmid,
}: ChangeTempalateWorkflowParams) {
  "use workflow";

  const rollbacks: Array<() => Promise<void>> = [];

  try {
    // 0. Update the server state and mark it as installing
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

    // 1. Resolve the template and make sure its image is on the node
    const template = await getTemplateStep({
      proxmoxTemplateId,
      proxmoxNode,
    });

    // 2. Stop the guest
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

    // 3. Build a temporary guest from the new template's image
    const { createdVmid: clonedVmid, createUpid } =
      await createGuestFromImageStep({
        proxmoxNode,
        volid: template.volid,
        storage: proxmoxNode.vmStorage,
        template,
        name: `temp-os-change-${vmid}`,
        description: `Temporary guest for OS change of ${vmid}`,
      });

    await sleep("5s");
    await waitForProxmoxTaskStep({
      proxmoxNode,
      upid: createUpid,
      ignoreErrors: false,
    });

    rollbacks.push(() =>
      rollbackCreateGuestFromImageStep({
        proxmoxNode,
        vmid: clonedVmid,
        createUpid,
      }),
    );

    // 4. Detach the current disk and clear cloud-init/network config from the
    //    original guest. The deleted keys are captured in `previousConfig` so
    //    that we can either restore them if step 5 fails, or re-apply the
    //    cloud-init values later in step 7.
    const { previousConfig, addedKeys } = await applyGuestConfigStep({
      proxmoxNode,
      vmid,
      config: {
        delete: [
          // Detach the current disk (moves it to unused0 for now).
          "scsi0",
          // Clear cloud-init and network configuration so step 7 can
          // re-apply them with the new password.
          "cicustom",
          "ciuser",
          "cipassword",
          "ciupgrade",
          "net0",
          "net1",
          "boot",
        ].join(","),
      },
      mode: "sync",
    });

    // This rollback is only safe BEFORE step 5 completes: step 5 fills the
    // scsi0 slot with the new disk, and step 7 destroys the old disk at
    // `unused0`. After either of those, restoring the old `scsi0` value would
    // either clash or reference a non-existent volume. We pop this rollback
    // immediately after step 5 succeeds.
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

    // 5. Move the disk from the temporary guest to the original guest
    const { upid: moveUpid } = await moveDiskStep({
      proxmoxNode,
      vmid: clonedVmid,
      disk: "scsi0",
      "target-vmid": vmid,
      "target-disk": "scsi0",
      // No bandwidth limit during the move
      bwlimit: 0,
      // Delete the disk from the temporary guest after successful move
      // Safes space on the temporary guest if it fails to delete after move
      delete: true,
    });

    await sleep("3s");
    await waitForProxmoxTaskStep({
      proxmoxNode,
      upid: moveUpid,
      ignoreErrors: false,
    });

    // Past the point of no return for the pre-move rollback: the cloned
    // disk now occupies scsi0 and the original disk at `unused0` will be
    // destroyed in step 7.
    const preMoveRollbackIndex = rollbacks.indexOf(
      restorePreMoveConfigRollback,
    );
    if (preMoveRollbackIndex !== -1) {
      rollbacks.splice(preMoveRollbackIndex, 1);
    }

    // 6. Resize the disk to the original plan size
    const { resizeUpid } = await resizeDiskStep({
      proxmoxNode,
      vmid,
      disk: "scsi0",
      size,
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

    // 7. Delete the newly unused disk from the original guest
    await applyGuestConfigStep({
      proxmoxNode,
      vmid,
      config: {
        // Re-apply the previous cloud-init configuration with new password.
        // `cicustom` is deliberately *not* restored here: it points at the old
        // template's vendor data, and the guest is now running a different OS.
        // Step 7b re-renders it.
        ...{
          ciuser: previousConfig.ciuser,
          cipassword: initialRootPassword,
          ciupgrade: previousConfig.ciupgrade,
          net0: previousConfig.net0,
          net1: previousConfig.net1,
          boot: previousConfig.boot,
        },
        // Delete the unused disk from the original guest
        delete: "unused0",
      },
      mode: "sync",
    });

    // 7b. Re-render cloud-init for the *new* template. The network snippet is
    //     left alone - the guest keeps its addresses - but the vendor data has
    //     to match the OS that is now on the disk.
    const { cicustomUpid } = await applyCloudInitStep({
      proxmoxNode,
      vmid,
      proxmoxTemplateId,
    });

    await waitForProxmoxTaskStep({
      proxmoxNode,
      upid: cicustomUpid,
      ignoreErrors: false,
    });

    // 8. Regenerate the cloud-init configuration to make password change effective
    await regenerateCloudInitStep({
      proxmoxNode,
      vmid,
    });

    // 9. Start the original guest
    // Wait for the guest to start to assert that the OS change was successful
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
        ignoreFollowupTask: true,
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
          ignoreFollowupTask: true,
        });
      }
    });

    // 10. Update the server state and mark it as installed with the new template
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
        },
      }),
    );

    // TODO: Optionally send email to the user that the template has been changed

    try {
      // After: Try to destroy the temporary guest
      // Ignore errors as there is not much data stored and it can be manually deleted later.
      await destroyGuestStep({
        proxmoxNode,
        vmid: clonedVmid,
      });
    } catch (error) {
      console.warn(
        `[@virtbase/api] Failed to destroy temporary guest after successful template change:`,
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
