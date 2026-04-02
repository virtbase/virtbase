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

import { findFirstAvailableSubnet } from "@virtbase/db/queries";
import { FatalError } from "workflow";
import type { NetworkAdapter } from "../../proxmox/generate-cloud-init-network-config";
import { generateRandomMacAddress } from "../../proxmox/generate-random-mac-address";

type GetNetworkAdaptersStepParams = {
  proxmoxNodeId: string;
  netrate?: number | null;
};

type GetNetworkAdaptersStepResult = {
  allocations: string[];
  adapters: (NetworkAdapter & {
    vlan: number;
    bridge: string;
    netrate?: number | null;
  })[];
};

export async function getNetworkAdaptersStep({
  proxmoxNodeId,
  netrate,
}: GetNetworkAdaptersStepParams): Promise<GetNetworkAdaptersStepResult> {
  "use step";

  const [v4, v6] = await Promise.all([
    findFirstAvailableSubnet(4, 32, proxmoxNodeId),
    findFirstAvailableSubnet(6, 128, proxmoxNodeId),
  ]);

  if (null === v4 || null === v6) {
    throw new FatalError(
      `No available subnets found for Proxmox node "${proxmoxNodeId}". Please ensure that enough IPv4 and IPv6 space is available.`,
    );
  }

  const isSameBridge = v4.bridge === v6.bridge;
  const isSameVlan = v4.vlan === v6.vlan;

  if (isSameBridge && isSameVlan) {
    // If both subnets are on the same bridge and vlan, we can use a single network adapter
    return {
      allocations: [v4.id, v6.id],
      adapters: [
        {
          addresses: {
            4: [v4.cidr],
            6: [v6.cidr],
          },
          gateways: {
            4: [v4.gateway],
            6: [v6.gateway],
          },
          macaddress: generateRandomMacAddress(),
          vlan: v4.vlan,
          bridge: v4.bridge,
          netrate,
        },
      ],
    };
  }

  // If the subnets are on different bridges or vlans, we need to use two separate network adapters
  return {
    allocations: [v4.id, v6.id],
    adapters: [
      {
        addresses: { 4: [v4.cidr], 6: [] },
        gateways: { 4: [v4.gateway], 6: [] },
        macaddress: generateRandomMacAddress(),
        bridge: v4.bridge,
        vlan: v4.vlan,
        netrate,
      },
      {
        addresses: { 4: [], 6: [v6.cidr] },
        gateways: { 4: [], 6: [v6.gateway] },
        macaddress: generateRandomMacAddress(),
        bridge: v6.bridge,
        vlan: v6.vlan,
        netrate,
      },
    ],
  };
}
