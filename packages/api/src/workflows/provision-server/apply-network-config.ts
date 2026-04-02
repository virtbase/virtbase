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

import type { GetProxmoxInstanceParams, NetworkAdapter } from "../../proxmox";
import { getProxmoxInstance } from "../../proxmox";
import { generateCloudInitNetworkConfig } from "../../proxmox/generate-cloud-init-network-config";
import { getNetworkAdapterConfig } from "../../proxmox/get-network-adapter-config";

type ApplyNetworkConfigStepParams = {
  proxmoxNode: GetProxmoxInstanceParams & { snippetStorage: string };
  vmid: number;
  adapters: (NetworkAdapter & {
    vlan: number;
    bridge: string;
    netrate?: number | null;
  })[];
};

export async function applyNetworkConfigStep({
  proxmoxNode: { snippetStorage, ...proxmoxNode },
  vmid,
  adapters,
}: ApplyNetworkConfigStepParams) {
  "use step";

  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  const cinetwork = generateCloudInitNetworkConfig(adapters);

  const filename = `ci-network-${vmid}.yml`;

  await instance.uploadSnippet({
    filename,
    storage: snippetStorage,
    contents: cinetwork,
  });

  const [networkConfigUpid] = await Promise.all([
    vm.config.$post({
      ...Object.assign(
        {},
        ...adapters.map((adapter, index) => ({
          [`net${index}`]: getNetworkAdapterConfig({
            vlan: adapter.vlan,
            bridge: adapter.bridge,
            macaddress: adapter.macaddress,
            netrate: adapter.netrate,
          }),
        })),
      ),
      cicustom: `network=${snippetStorage}:snippets/${filename}`,
    }),
    vm.firewall.options.$put({
      // Firewall MUST always be enabled for the following IP filters to work
      enable: true,
      // By default, accept all traffic in both directions
      policy_in: "ACCEPT",
      policy_out: "ACCEPT",
      // We are not interested in logging network traffic for now
      log_level_in: "nolog",
      log_level_out: "nolog",
      // Prevent IPv6 mac address spoofing
      ipfilter: true,
      // Prevent MAC address spoofing
      macfilter: true,
      // Allow NDP for IPv6 fe80::/64 addresses to work
      ndp: adapters.some((adapter) => adapter.addresses[6].length > 0),
      // Disable DHCP, since we use static IP addresses
      dhcp: false,
      // Disable router advertisement, since we use static IP addresses (IPv6 only)
      radv: false,
    }),
  ]);

  // Create ipfilters for each network adapter
  await Promise.all(
    adapters.map((_, index) =>
      vm.firewall.ipset.$post({
        name: `ipfilter-net${index}`,
        comment: `System generated filter set to prevent IP address spoofing`,
      }),
    ),
  );

  // Add the CIDRs to the respective ipfilters
  await Promise.all(
    adapters.map((adapter, index) =>
      Promise.all(
        Object.values(adapter.addresses)
          .flat()
          .map((cidr) =>
            vm.firewall.ipset.$(`ipfilter-net${index}`).$post({
              cidr,
              nomatch: false,
            }),
          ),
      ),
    ),
  );

  return {
    networkConfigUpid,
  };
}

export async function rollbackApplyNetworkConfigStep({
  proxmoxNode: { snippetStorage, ...proxmoxNode },
  vmid,
}: Omit<ApplyNetworkConfigStepParams, "adapters">) {
  "use step";

  const instance = getProxmoxInstance(proxmoxNode);
  const vm = instance.node.qemu.$(vmid);

  await Promise.all([
    // Delete created network adapters
    vm.config.$put({
      delete: "net0,ipconfig0,net1,ipconfig1",
    }),
    // Delete created firewall options
    vm.firewall.options.$put({
      delete:
        "enable,policy_in,policy_out,log_level_in,log_level_out,ipfilter,macfilter,ndp,dhcp,radv",
    }),
    // Delete created network configuration snippet
    instance.node.storage
      .$(snippetStorage)
      .content.$(`${snippetStorage}:snippets/ci-network-${vmid}.yml`)
      .$delete(),
  ]);

  // Delete created firewall IP sets
  const ipsets = await vm.firewall.ipset.$get();
  for (const ipset of ipsets) {
    const entries = await vm.firewall.ipset.$(ipset.name).$get();
    await Promise.all(
      entries.map((entry) =>
        vm.firewall.ipset.$(ipset.name).$(`${entry.cidr}`).$delete(),
      ),
    );
    await vm.firewall.ipset.$(ipset.name).$delete();
  }
}
