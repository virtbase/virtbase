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
import { changeAdapterNetrate } from "../../proxmox/change-adapter-netrate";
import {
  applyGuestConfigStep,
  rollbackApplyGuestConfigStep,
} from "../shared/apply-guest-config";
import { getGuestConfigStep } from "../shared/get-guest-config";
import { getServerStep } from "../shared/get-server";
import { getServerPlanStep } from "../shared/get-server-plan";
import {
  performGuestActionStep,
  rollbackPerformGuestActionStep,
} from "../shared/perform-guest-action";
import { resizeDiskStep } from "../shared/resize-disk";
import { waitForProxmoxTaskStep } from "../shared/wait-for-proxmox-task";
import {
  rollbackStoreServerUpgradeStep,
  storeServerUpgradeStep,
} from "./store-server-upgrade";

export async function upgradeServerWorkflow({
  serverId,
  serverPlanId,
}: {
  serverId: string;
  serverPlanId: string;
}) {
  "use workflow";

  const rollbacks: Array<() => Promise<void>> = [];

  try {
    // 1. & 2. Get the server and plan, assert that the server and plan exists
    const [server, plan] = await Promise.all([
      getServerStep({ serverId }),
      getServerPlanStep({ serverPlanId }),
    ]);

    const { config: currentConfig } = await getGuestConfigStep({
      vmid: server.vmid,
      proxmoxNode: server.proxmoxNode,
      // Include pending changes
      current: true,
    });

    // 3. Prepare new hardware config
    const {
      upid: configUpid,
      previousConfig,
      addedKeys,
    } = await applyGuestConfigStep({
      proxmoxNode: server.proxmoxNode,
      vmid: server.vmid,
      mode: "sync",
      config: {
        cores: plan.cores,
        cpulimit: plan.cores,
        memory: `${plan.memory}`,
        balloon: plan.memory,
        ...Object.fromEntries(
          ["net0", "net1"]
            .filter((adapter) => Boolean(currentConfig[adapter]))
            .map((adapter) => [
              adapter,
              changeAdapterNetrate({
                net: currentConfig[adapter],
                netrate: plan.netrate,
              }),
            ]),
        ),
      },
    });

    rollbacks.push(async () => {
      const { upid } = await rollbackApplyGuestConfigStep({
        proxmoxNode: server.proxmoxNode,
        vmid: server.vmid,
        previousConfig,
        addedKeys,
        mode: "sync",
      });
      if (null !== upid) {
        await waitForProxmoxTaskStep({
          proxmoxNode: server.proxmoxNode,
          upid,
          ignoreErrors: true,
        });
      }
    });

    if (null !== configUpid) {
      await waitForProxmoxTaskStep({
        proxmoxNode: server.proxmoxNode,
        upid: configUpid,
        ignoreErrors: false,
      });
    }

    // 4. Resize the disk to the new plan size
    const { resizeUpid } = await resizeDiskStep({
      proxmoxNode: server.proxmoxNode,
      vmid: server.vmid,
      size: plan.storage,
      disk: "scsi0",
    });
    if (resizeUpid) {
      await sleep("5s");
      await waitForProxmoxTaskStep({
        proxmoxNode: server.proxmoxNode,
        upid: resizeUpid,
        ignoreErrors: false,
      });
    }

    // 5. Store the server upgrade
    await storeServerUpgradeStep({
      serverId,
      serverPlanId,
    });

    rollbacks.push(async () => {
      await rollbackStoreServerUpgradeStep({
        serverId,
        previousServerPlanId: server.serverPlanId,
      });
    });

    // 6. Stop the guest to apply the new hardware config
    const { upid: stopUpid } = await performGuestActionStep({
      proxmoxNode: server.proxmoxNode,
      vmid: server.vmid,
      action: "stop",
    });
    if (stopUpid) {
      await sleep("3s");
      await waitForProxmoxTaskStep({
        proxmoxNode: server.proxmoxNode,
        upid: stopUpid,
        ignoreErrors: false,
      });
    }

    rollbacks.push(async () => {
      const { upid: startUpid } = await rollbackPerformGuestActionStep({
        proxmoxNode: server.proxmoxNode,
        vmid: server.vmid,
        initialAction: "stop",
        upid: stopUpid,
      });
      if (null !== startUpid) {
        await waitForProxmoxTaskStep({
          proxmoxNode: server.proxmoxNode,
          upid: startUpid,
          ignoreErrors: true,
        });
      }
    });

    // 7. Start the guest to apply the new hardware config
    const { upid: startUpid } = await performGuestActionStep({
      proxmoxNode: server.proxmoxNode,
      vmid: server.vmid,
      action: "start",
    });
    if (startUpid) {
      await sleep("5s");
      await waitForProxmoxTaskStep({
        proxmoxNode: server.proxmoxNode,
        upid: startUpid,
        ignoreErrors: false,
      });
    }

    rollbacks.push(async () => {
      const { upid: stopUpid } = await rollbackPerformGuestActionStep({
        proxmoxNode: server.proxmoxNode,
        vmid: server.vmid,
        initialAction: "start",
        upid: startUpid,
      });
      if (null !== stopUpid) {
        await waitForProxmoxTaskStep({
          proxmoxNode: server.proxmoxNode,
          upid: stopUpid,
          ignoreErrors: true,
        });
      }
    });

    // 8. TODO: Optionally send email to the user that the server has been upgraded
  } catch (error) {
    for (const rollback of rollbacks.reverse()) {
      await rollback();
    }
    throw error;
  }
}
