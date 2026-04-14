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
import type { GetProxmoxInstanceParams } from "../../proxmox/get-proxmox-instance";
import { applyGuestConfigStep } from "../shared/apply-guest-config";
import { cloneGuestStep, rollbackCloneGuestStep } from "../shared/clone-guest";
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
  proxmoxNode: GetProxmoxInstanceParams & { id: string };
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

    // 1. Assert that template exists
    const template = await getTemplateStep({
      proxmoxTemplateId,
      proxmoxNodeId: proxmoxNode.id,
    });

    // 2. Stop the guest
    const { upid: stopUpid } = await performGuestActionStep({
      proxmoxNode,
      vmid,
      action: "stop",
    });

    await sleep("5s");
    await waitForProxmoxTaskStep({
      proxmoxNode,
      upid: stopUpid,
      ignoreErrors: false,
    });

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

    // 3. Clone the template to a temporary guest
    const { clonedVmid, cloneUpid } = await cloneGuestStep({
      proxmoxNode,
      vmid: template.vmid,
      options: {
        name: `temp-os-change-${vmid}`,
        description: `Temporary guest for OS change of ${vmid}`,
        // TODO: Other storage per node
        target: proxmoxNode.hostname,
      },
    });

    await sleep("5s");
    await waitForProxmoxTaskStep({
      proxmoxNode,
      upid: cloneUpid,
      ignoreErrors: false,
    });

    rollbacks.push(() =>
      rollbackCloneGuestStep({
        proxmoxNode,
        newid: clonedVmid,
        cloneUpid,
      }),
    );

    // 4. Delete the current disk from the original guest
    const { previousConfig } = await applyGuestConfigStep({
      proxmoxNode,
      vmid,
      config: {
        delete: [
          // Delete the current disk
          "scsi0",
          // Delete current cloud-init and network configuration
          // Ensures that these properties are returned with the previous config
          "cicustom,ciuser,cipassword,ciupgrade,net0,net1,boot",
        ].join(","),
      },
      mode: "sync",
    });

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

    await sleep("5s");
    await waitForProxmoxTaskStep({
      proxmoxNode,
      upid: moveUpid,
      ignoreErrors: false,
    });

    // 6. Resize the disk to the original plan size
    const { resizeUpid } = await resizeDiskStep({
      proxmoxNode,
      vmid,
      disk: "scsi0",
      size,
    });

    if (resizeUpid) {
      await sleep("5s");
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
        // Re-apply the previous cloud-init configuration with new password
        ...{
          cicustom: previousConfig.cicustom,
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

    await sleep("5s");
    await waitForProxmoxTaskStep({
      proxmoxNode,
      upid: startUpid,
      ignoreErrors: false,
    });

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
