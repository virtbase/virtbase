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

export const getNetworkAdapterConfig = ({
  vlan,
  bridge,
  macaddress,
  netrate,
}: {
  vlan: number;
  bridge: string;
  macaddress: string;
  netrate?: number | null;
}) => {
  let config = `model=virtio,bridge=${bridge},firewall=1,macaddr=${macaddress}`;
  if (vlan > 0) {
    // If VLAN tag with 0 is used, Proxmox will throw an error
    // Only add the VLAN tag if it is greater than 0
    config += `,tag=${vlan}`;
  }
  if (netrate) {
    config += `,rate=${netrate}`;
  }
  return config;
};
