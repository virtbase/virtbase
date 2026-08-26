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
import { purgeAllBackupsStep } from "../delete-server/purge-all-backups";
import { resetPointerRecordsStep } from "../delete-server/reset-pointer-records";
import { storeServerDeletionStep } from "../delete-server/store-server-deletion";
import { destroyGuestStep } from "./destroy-guest";
import { performGuestActionStep } from "./perform-guest-action";
import { waitForProxmoxTaskStep } from "./wait-for-proxmox-task";

type DeleteOneServerParams = {
  vmid: number;
  serverId: string;
  proxmoxNode: GetProxmoxInstanceParams;
};

/**
 * Destroys one server and everything that belongs to it.
 *
 * Not a step and not a workflow - an orchestration helper that runs inside
 * whichever workflow calls it, stitching the same steps together the way the
 * workflow function would have inline. That is what lets `deleteServerWorkflow`
 * and the account offboarding share one destruction sequence instead of
 * growing two that drift.
 *
 * Deliberately does not notify anyone. Deleting a single server warrants an
 * email; deleting an account warrants one email about the account, not one per
 * server. The caller decides.
 */
export async function deleteOneServer({
  vmid,
  serverId,
  proxmoxNode,
}: DeleteOneServerParams) {
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
  return storeServerDeletionStep({
    serverId,
  });
}
