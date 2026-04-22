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

export const changeAdapterNetrate = ({
  net,
  netrate,
}: {
  /**
   * The current network config of Proxmox.
   */
  net?: string;
  /**
   * The new network rate in MB/s.
   */
  netrate: number | null;
}): string | undefined => {
  if (!net) {
    // If the current network config is empty, do nothing
    // This could be because the VM only has one network interface (only IPv4/IPv6)
    return net;
  }

  if (net.includes("rate=")) {
    // The current network config already has a ratelimit
    // We need to update it

    if (!netrate) {
      // The new network config does not have a ratelimit
      // We strip the current ratelimit and return the old config as is
      return net.replace(/rate=\d+/, "");
    }

    // The new network config has a ratelimit
    // Update the ratelimit and return the new config
    return net.replace(/rate=\d+/, `rate=${netrate}`);
  }

  // The current network config does not have a ratelimit
  // Add the new ratelimit and return the new config
  return `${net},rate=${netrate}`;
};
