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

import { FatalError, sleep } from "workflow";
import { cloneGuestStep, rollbackCloneGuestStep } from "../shared/clone-guest";
import { getTemplateStep } from "../shared/get-template";
import { resizeDiskStep, rollbackResizeDiskStep } from "../shared/resize-disk";
import { rollbackStartGuestStep, startGuestStep } from "../shared/start-guest";
import { waitForProxmoxTaskStep } from "../shared/wait-for-proxmox-task";
import {
  applyHardwareConfigStep,
  rollbackApplyHardwareConfigStep,
} from "./apply-hardware-config";
import {
  applyNetworkConfigStep,
  rollbackApplyNetworkConfigStep,
} from "./apply-network-config";
import { selectProxmoxNodeStep } from "./select-proxmox-node";
import { sendServerReadyEmailStep } from "./send-server-ready-email";
import {
  rollbackStoreProvisionedServerStep,
  storeProvisionedServerStep,
} from "./store-provisioned-server";

type ProvisionServerWorkflowParams = {
  serverPlanId: string;
  userId: string;
  proxmoxTemplateId?: string | null;
  initialRootPassword?: string | null;
  initialSSHKeyId?: string | null;
};

export async function provisionServerWorkflow({
  serverPlanId,
  userId,
  proxmoxTemplateId,
  initialRootPassword,
  initialSSHKeyId,
}: ProvisionServerWorkflowParams) {
  "use workflow";

  const { plan, selectedNode } = await selectProxmoxNodeStep({ serverPlanId });

  if (!proxmoxTemplateId) {
    // TODO: Implement custom iso flow
    throw new FatalError(
      "Provisioning a server without a template is currently not implemented.",
    );
  }

  const template = await getTemplateStep({
    proxmoxTemplateId,
    proxmoxNodeId: selectedNode.id,
  });

  const rollbacks: Array<() => Promise<void>> = [];

  try {
    const { clonedVmid, clonedName, cloneUpid } = await cloneGuestStep({
      proxmoxNode: selectedNode,
      vmid: template.vmid,
      options: {
        // TODO: Other storage per node
        target: template.storage,
      },
    });

    rollbacks.push(() =>
      rollbackCloneGuestStep({
        proxmoxNode: selectedNode,
        newid: clonedVmid,
        cloneUpid,
      }),
    );

    const { resizeUpid, oldSize } = await resizeDiskStep({
      proxmoxNode: selectedNode,
      vmid: clonedVmid,
      size: plan.storage,
      disk: "scsi0",
    });

    if (resizeUpid) {
      // Wait at least 5 seconds before checking task status
      await sleep("5s");
      await waitForProxmoxTaskStep({
        proxmoxNode: selectedNode,
        upid: resizeUpid,
        ignoreErrors: false,
      });

      rollbacks.push(() =>
        rollbackResizeDiskStep({
          proxmoxNode: selectedNode,
          vmid: clonedVmid,
          disk: "scsi0",
          resizeUpid,
          oldSize: oldSize,
        }),
      );
    }

    const { configUpid, rootPassword, isRootPasswordGenerated, sshKeyApplied } =
      await applyHardwareConfigStep({
        proxmoxNode: selectedNode,
        vmid: clonedVmid,
        plan,
        initialRootPassword,
        initialSSHKeyId,
      });

    // This step is pretty much instant, so don't sleep here.
    await waitForProxmoxTaskStep({
      proxmoxNode: selectedNode,
      upid: configUpid,
      ignoreErrors: false,
    });

    rollbacks.push(() =>
      rollbackApplyHardwareConfigStep({
        proxmoxNode: selectedNode,
        vmid: clonedVmid,
      }),
    );

    const { networkConfigUpid } = await applyNetworkConfigStep({
      proxmoxNode: selectedNode,
      vmid: clonedVmid,
    });

    await waitForProxmoxTaskStep({
      proxmoxNode: selectedNode,
      upid: networkConfigUpid,
      ignoreErrors: false,
    });

    rollbacks.push(() =>
      rollbackApplyNetworkConfigStep({
        proxmoxNode: selectedNode,
        vmid: clonedVmid,
      }),
    );

    const { serverId } = await storeProvisionedServerStep({
      name: clonedName,
      vmid: clonedVmid,
      proxmoxNodeId: selectedNode.id,
      userId,
      serverPlanId,
      proxmoxTemplateId,
    });

    rollbacks.push(() =>
      rollbackStoreProvisionedServerStep({
        serverId,
      }),
    );

    const { startUpid } = await startGuestStep({
      proxmoxNode: selectedNode,
      vmid: clonedVmid,
    });

    await sleep("5s");
    await waitForProxmoxTaskStep({
      proxmoxNode: selectedNode,
      upid: startUpid,
      ignoreErrors: false,
    });

    rollbacks.push(async () => {
      const { stopUpid } = await rollbackStartGuestStep({
        proxmoxNode: selectedNode,
        vmid: clonedVmid,
      });
      await waitForProxmoxTaskStep({
        proxmoxNode: selectedNode,
        upid: stopUpid,
        ignoreErrors: true,
      });
    });

    await sendServerReadyEmailStep({
      userId,
      serverId,
      // Only send the root password if it was generated by the system
      initialRootPassword: isRootPasswordGenerated ? rootPassword : null,
      sshKeyApplied,
    });
  } catch (error) {
    for (const rollback of rollbacks.reverse()) {
      await rollback();
    }
    throw error;
  }
}
