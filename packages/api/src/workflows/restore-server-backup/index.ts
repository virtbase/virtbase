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
  performGuestActionStep,
  rollbackPerformGuestActionStep,
} from "../shared/perform-guest-action";
import { waitForProxmoxTaskStep } from "../shared/wait-for-proxmox-task";
import { loadBackupStep } from "./load-backup";
import {
  rollbackStoreRestoredBackupStep,
  storeRestoredBackupStep,
} from "./store-restored-backup";

type RestoreServerBackupWorkflowParams = {
  proxmoxNode: GetProxmoxInstanceParams;
  vmid: number;
  volid: string;
  proxmoxTemplateId: string | null;
  currentProxmoxTemplateId: string | null;
  serverId: string;
};

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
    // 1. Stop the guest
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

    // 2. Restore the backup from file
    // This step can not be rolled back and deletes data
    const { upid: restoreUpid } = await loadBackupStep({
      proxmoxNode,
      vmid,
      volid,
    });

    await sleep("30s");
    await waitForProxmoxTaskStep({
      proxmoxNode,
      upid: restoreUpid,
      ignoreErrors: false,
    });

    // 3. Restore original configuration
    // This step is required in case the customer has upgraded their server, but restores an older backup.
    // Proxmox saves the whole VM configuration in the backup.

    // TODO: Implement

    // 4. Restart the guest
    const { upid: startUpid } = await performGuestActionStep({
      proxmoxNode,
      vmid,
      action: "start",
    });

    await sleep("5s");
    // Check if the guest can start correctly before unlocking the server
    // If this fails, the server will still be locked to prevent further actions by the customer
    await waitForProxmoxTaskStep({
      proxmoxNode,
      upid: startUpid,
      ignoreErrors: false,
    });

    // 5. Store the new server state
    await storeRestoredBackupStep({
      serverId,
      proxmoxTemplateId,
    });
    rollbacks.push(async () => {
      await rollbackStoreRestoredBackupStep({
        serverId,
        previousProxmoxTemplateId: currentProxmoxTemplateId,
      });
    });

    // TODO: Optionally send email to the user that the backup has been restored
  } catch (error) {
    for (const rollback of rollbacks.reverse()) {
      await rollback();
    }
    throw error;
  }
}
