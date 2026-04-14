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

import type { GetProxmoxInstanceParams } from "../../proxmox/get-proxmox-instance";
import { getProxmoxInstance } from "../../proxmox/get-proxmox-instance";

type DestroyGuestStepParams = {
  proxmoxNode: GetProxmoxInstanceParams;
  vmid: number;
};

export async function destroyGuestStep({
  proxmoxNode,
  vmid,
}: DestroyGuestStepParams) {
  "use step";

  const { node } = getProxmoxInstance(proxmoxNode);

  const upid = await node.qemu.$(vmid).$delete({
    "destroy-unreferenced-disks": true,
    purge: true,
  });

  return {
    upid,
  };
}
