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

import type {
  GetProxmoxInstanceParams,
  ProxmoxInstance,
} from "../../proxmox/get-proxmox-instance";
import { getProxmoxInstance } from "../../proxmox/get-proxmox-instance";

type MoveDiskParams = Parameters<
  ReturnType<ProxmoxInstance["node"]["qemu"]["$"]>["move_disk"]["$post"]
>[0];

interface MoveDiskStepParams extends MoveDiskParams {
  proxmoxNode: GetProxmoxInstanceParams;
  vmid: number;
}

export async function moveDiskStep({
  proxmoxNode,
  vmid,
  ...params
}: MoveDiskStepParams) {
  "use step";

  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  const upid = await vm.move_disk.$post(params);

  return {
    upid,
  };
}
