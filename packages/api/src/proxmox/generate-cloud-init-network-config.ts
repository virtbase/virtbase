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

export interface NetworkAdapter {
  addresses: Record<4 | 6, string[]>;
  gateways: Record<4 | 6, string[]>;
  macaddress: string;
}

// Quad9 DNS servers as default for IPv4 and IPv6
const DEFAULT_IPV4_DNS_SERVERS = ["9.9.9.9", "149.112.112.112"];
const DEFAULT_IPV6_DNS_SERVERS = ["2620:fe::fe", "2620:fe::9"];

export const generateCloudInitNetworkConfig = (adapters: NetworkAdapter[]) => {
  const getRoutes = ({ gateways }: NetworkAdapter): string[] => {
    const routes = [];
    if (gateways[4] && gateways[4].length > 0) {
      for (const gateway of gateways[4]) {
        routes.push(
          `- to: 0.0.0.0/0`,
          `  via: ${gateway}`,
          `  # on-link: true`,
          `- to: ${gateway}/32`,
          `  # scope: link`,
        );
      }
    }
    if (gateways[6] && gateways[6].length > 0) {
      for (const gateway of gateways[6]) {
        routes.push(
          `- to: ::/0`,
          `  via: ${gateway}`,
          `  # on-link: true`,
          `- to: ${gateway}/128`,
          `  # scope: link`,
        );
      }
    }
    return routes;
  };

  const getDnsServers = ({ addresses }: NetworkAdapter): string[] => {
    const dnsServers = [];
    if (addresses[4] && addresses[4].length > 0) {
      dnsServers.push(...DEFAULT_IPV4_DNS_SERVERS);
    }
    if (addresses[6] && addresses[6].length > 0) {
      dnsServers.push(...DEFAULT_IPV6_DNS_SERVERS);
    }
    return dnsServers;
  };

  const generateEthernet = (adapter: NetworkAdapter, index: number) => {
    const name = `eth${index}`;

    return [
      `${name}:`,
      `    addresses:`,
      ...adapter.addresses[4].map((addr) => `    - ${addr}`),
      ...adapter.addresses[6].map((addr) => `    - ${addr}`),
      `    routes:`,
      ...getRoutes(adapter).map((line) => `    ${line}`),
      `    match:`,
      `        macaddress: ${adapter.macaddress.toLowerCase()}`,
      `    nameservers:`,
      `        addresses:`,
      ...getDnsServers(adapter).map((s) => `        - ${s}`),
      `        search:`,
      `        - localdomain`,
      `    set-name: ${name}`,
    ];
  };

  const ethernets = adapters
    .map((adapter, i) => generateEthernet(adapter, i))
    .map((lines) => lines.map((line) => `        ${line}`).join("\n"))
    .join("\n");

  return ["network:", "    version: 2", "    ethernets:", ethernets].join("\n");
};
