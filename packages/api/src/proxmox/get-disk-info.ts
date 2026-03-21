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

import type { getProxmoxInstance } from "./get-proxmox-instance";

type GetDiskInfoResult =
  | {
      result?: { "used-bytes": unknown }[];
    }
  | undefined;

export const getDiskInfo = async (
  instance: ReturnType<typeof getProxmoxInstance>,
  vmid: number,
) => {
  const vm = instance.node.qemu.$(vmid);

  try {
    const response = (await vm.agent["get-fsinfo"].$get()) as GetDiskInfoResult;
    if (!response?.result) {
      return null;
    }

    const totalUsedBytes = response.result
      .filter(
        (item): item is { "used-bytes": number } =>
          typeof item["used-bytes"] === "number",
      )
      .reduce((acc, curr) => acc + curr["used-bytes"], 0);

    return {
      totalUsedBytes,
    };
  } catch {
    // qemu-guest-agent not installed or other error
    return null;
  }
};
