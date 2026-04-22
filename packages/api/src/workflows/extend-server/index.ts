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
import {
  applyGuestConfigStep,
  rollbackApplyGuestConfigStep,
} from "../shared/apply-guest-config";
import {
  performGuestActionStep,
  rollbackPerformGuestActionStep,
} from "../shared/perform-guest-action";
import { waitForProxmoxTaskStep } from "../shared/wait-for-proxmox-task";
import { sendServerExtendedEmailStep } from "./send-server-extended-email";
import {
  rollbackStoreServerExtensionStep,
  storeServerExtensionStep,
} from "./store-server-extension";

type ExtendServerWorkflowParams = {
  serverId: string;
};

export async function extendServerWorkflow({
  serverId,
}: ExtendServerWorkflowParams) {
  "use workflow";

  const rollbacks: Array<() => Promise<void>> = [];

  try {
    const { server, proxmoxNode, newTerminatesAt, user } =
      await storeServerExtensionStep({ serverId });

    rollbacks.push(() =>
      rollbackStoreServerExtensionStep({
        serverId,
        suspendedAt: server.suspendedAt,
      }),
    );

    const { previousConfig, addedKeys } = await applyGuestConfigStep({
      proxmoxNode,
      vmid: server.vmid,
      config: {
        // Re-enable the server to boot on host node boot.
        onboot: true,
      },
      mode: "sync",
    });

    rollbacks.push(async () => {
      const { upid } = await rollbackApplyGuestConfigStep({
        proxmoxNode,
        vmid: server.vmid,
        previousConfig,
        addedKeys,
        mode: "sync",
      });
      if (null !== upid) {
        await waitForProxmoxTaskStep({
          proxmoxNode,
          upid,
          ignoreErrors: true,
        });
      }
    });

    const { upid: startUpid } = await performGuestActionStep({
      action: "start",
      proxmoxNode,
      vmid: server.vmid,
    });

    if (null !== startUpid) {
      await sleep("5s");
      await waitForProxmoxTaskStep({
        proxmoxNode,
        upid: startUpid,
        ignoreErrors: false,
      });
    }

    rollbacks.push(async () => {
      const { upid: rollbackStartUpid } = await rollbackPerformGuestActionStep({
        proxmoxNode,
        vmid: server.vmid,
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

    if (null !== newTerminatesAt) {
      await sendServerExtendedEmailStep({
        user,
        serverName: server.name,
        newTerminatesAt,
      });
    }
  } catch (error) {
    for (const rollback of rollbacks.reverse()) {
      await rollback();
    }
    throw error;
  }
}
