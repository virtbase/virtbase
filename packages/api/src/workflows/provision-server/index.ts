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
import {
  applyCloudInitStep,
  rollbackApplyCloudInitStep,
} from "../shared/apply-cloud-init";
import {
  createGuestFromImageStep,
  rollbackCreateGuestFromImageStep,
} from "../shared/create-guest-from-image";
import { getHAFailoverNodesStep } from "../shared/get-ha-failover-nodes";
import { getNetworkAdaptersStep } from "../shared/get-network-adapters";
import { getTemplateStep } from "../shared/get-template";
import {
  performGuestActionStep,
  rollbackPerformGuestActionStep,
} from "../shared/perform-guest-action";
import { reportSwallowedFailureStep } from "../shared/report-swallowed-failure";
import { resizeDiskStep, rollbackResizeDiskStep } from "../shared/resize-disk";
import { runRollbacks } from "../shared/run-rollbacks";
import { updateHASettingsStep } from "../shared/update-ha-settings";
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
  serverPlanPriceId: string;
  userId: string;
  proxmoxTemplateId?: string | null;
  initialRootPassword?: string | null;
  initialSSHKeyId?: string | null;
};

export async function provisionServerWorkflow({
  serverPlanId,
  serverPlanPriceId,
  userId,
  proxmoxTemplateId,
  initialRootPassword,
  initialSSHKeyId,
}: ProvisionServerWorkflowParams) {
  "use workflow";

  if (!proxmoxTemplateId) {
    // TODO: Implement custom iso flow
    throw new FatalError(
      "Provisioning a server without a template is currently not implemented.",
    );
  }

  const { plan, selectedNode } = await selectProxmoxNodeStep({ serverPlanId });

  const template = await getTemplateStep({
    proxmoxTemplateId,
    proxmoxNode: selectedNode,
  });

  const { adapters, allocations } = await getNetworkAdaptersStep({
    proxmoxNodeId: selectedNode.id,
    netrate: plan.netrate,
  });

  const rollbacks: Array<() => Promise<void>> = [];

  try {
    const {
      createdVmid: clonedVmid,
      createdName: clonedName,
      createUpid,
    } = await createGuestFromImageStep({
      proxmoxNode: selectedNode,
      volid: template.volid,
      // TODO: Other storage per node
      storage: selectedNode.vmStorage,
      template,
    });

    await sleep("3s");
    await waitForProxmoxTaskStep({
      proxmoxNode: selectedNode,
      upid: createUpid,
      ignoreErrors: false,
    });

    rollbacks.push(() =>
      rollbackCreateGuestFromImageStep({
        proxmoxNode: selectedNode,
        vmid: clonedVmid,
        createUpid,
      }),
    );

    const { resizeUpid } = await resizeDiskStep({
      proxmoxNode: selectedNode,
      vmid: clonedVmid,
      size: plan.storage,
      disk: "scsi0",
    });

    if (resizeUpid) {
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

    // Before the network step, because it owns `cicustom` and the guest should
    // never be startable with a half-written cloud-init configuration.
    const { cicustomUpid } = await applyCloudInitStep({
      proxmoxNode: selectedNode,
      vmid: clonedVmid,
      proxmoxTemplateId,
      adapters,
    });

    await waitForProxmoxTaskStep({
      proxmoxNode: selectedNode,
      upid: cicustomUpid,
      ignoreErrors: false,
    });

    rollbacks.push(() =>
      rollbackApplyCloudInitStep({
        proxmoxNode: selectedNode,
        vmid: clonedVmid,
      }),
    );

    const { networkConfigUpid } = await applyNetworkConfigStep({
      proxmoxNode: selectedNode,
      vmid: clonedVmid,
      adapters,
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
      serverPlanPriceId,
      proxmoxTemplateId,
      allocations,
    });

    rollbacks.push(() =>
      rollbackStoreProvisionedServerStep({
        serverId,
      }),
    );

    const { upid: startUpid } = await performGuestActionStep({
      proxmoxNode: selectedNode,
      vmid: clonedVmid,
      action: "start",
    });

    if (null !== startUpid) {
      await waitForProxmoxTaskStep({
        proxmoxNode: selectedNode,
        upid: startUpid,
        ignoreErrors: false,
      });
    }

    rollbacks.push(async () => {
      const { upid: stopUpid } = await rollbackPerformGuestActionStep({
        proxmoxNode: selectedNode,
        vmid: clonedVmid,
        initialAction: "start",
        upid: startUpid,
      });
      if (null !== stopUpid) {
        await waitForProxmoxTaskStep({
          proxmoxNode: selectedNode,
          upid: stopUpid,
          ignoreErrors: true,
        });
      }
    });

    // [!] A post-success side effect, exactly like the HA block below, and it
    // must not be compensated. By this point the guest is built, the row is
    // written and the customer has paid; `sendEmail` throws on a delivery
    // failure, so letting it escape would run the whole rollback stack - guest
    // destroy included - and tear down a paid-for server over a mail outage.
    // The workflow runtime has already retried the step by the time we get
    // here, so what is left is a persistent outage: report it and keep the
    // server.
    try {
      await sendServerReadyEmailStep({
        userId,
        serverId,
        // Only send the root password if it was generated by the system
        initialRootPassword: isRootPasswordGenerated ? rootPassword : null,
        sshKeyApplied,
      });
    } catch (error) {
      await reportSwallowedFailureStep({
        workflow: "provisionServerWorkflow",
        operation: "sendServerReadyEmailStep",
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      // Add up to 5 sibling nodes from the same node group as failover
      // targets so the HA stack can relocate the VM if the primary fails.
      const { hostnames: failoverHostnames } = await getHAFailoverNodesStep({
        proxmoxNodeGroupId: plan.proxmoxNodeGroupId,
        excludeHostname: selectedNode.hostname,
      });

      await updateHASettingsStep({
        proxmoxNode: selectedNode,
        vmid: clonedVmid,
        mode: "create",
        nodes: failoverHostnames,
      });
    } catch (error) {
      console.warn(
        "[@virtbase/api] Failed to update HA settings for new server: ",
        error,
      );
    }
  } catch (error) {
    // Every compensation is attempted, even if an earlier one throws - see
    // `runRollbacks`. The original error is what the caller gets.
    await runRollbacks(rollbacks, "provisionServerWorkflow");
    throw error;
  }
}
