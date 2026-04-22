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
import { destroyGuestStep } from "../shared/destroy-guest";
import { getServerOwnerStep } from "../shared/get-server-owner";
import { performGuestActionStep } from "../shared/perform-guest-action";
import { waitForProxmoxTaskStep } from "../shared/wait-for-proxmox-task";
import { purgeAllBackupsStep } from "./purge-all-backups";
import { resetPointerRecordsStep } from "./reset-pointer-records";
import { sendServerDeletedEmailStep } from "./send-server-deleted-email";
import { storeServerDeletionStep } from "./store-server-deletion";

type DeleteServerWorkflowParams = {
  vmid: number;
  serverId: string;
  proxmoxNode: GetProxmoxInstanceParams;
};

export async function deleteServerWorkflow(params: DeleteServerWorkflowParams) {
  "use workflow";

  const { vmid, serverId, proxmoxNode } = params;

  const user = await getServerOwnerStep({
    serverId,
  });

  // 1. Stop the guest
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

  // 2. Destroy the VM in Proxmox
  const { upid: destroyUpid } = await destroyGuestStep({
    proxmoxNode,
    vmid,
  });

  await sleep("5s");
  await waitForProxmoxTaskStep({
    proxmoxNode,
    upid: destroyUpid,
    ignoreErrors: false,
  });

  // 3. Purge all backups and reset pointer records
  await Promise.all([
    purgeAllBackupsStep({
      proxmoxNode,
      serverId,
    }),
    resetPointerRecordsStep({
      serverId,
    }),
  ]);

  // 4. Store the server deletion
  const { serverName } = await storeServerDeletionStep({
    serverId,
  });

  // 5. Send email to the user that the server has been deleted
  await sendServerDeletedEmailStep({
    user,
    serverName,
  });
}
