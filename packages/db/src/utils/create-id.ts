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

import baseX from "base-x";

const prefixes = [
  // Auth
  "usr_", // user
  "sess_", // session
  "acc_", // account
  "verif_", // verification
  "passkey_", // passkey
  // Proxmox VE
  "kvm_", // kvm instance
  "kbu_", // kvm backup
  "pn_", // proxmox node
  "dc_", // datacenter
  "png_", // proxmox node group
  "temp_", // proxmox template
  "ptg_", // proxmox template group
  // IPAM
  "ipsub_", // ipam subnet
  "ipaddr_", // ipam address
  "ipalloc_", // ipam allocation
  "ipptr_", // ipam ptr record
  "inv_", // invoice
  "pck_", // kvm package
  "api_", // api key
  "sshkey_", // ssh key
  "txn_", // transaction
] as const;

// ULID uses base32 encoding
const base32 = baseX("0123456789ABCDEFGHJKMNPQRSTVWXYZ");

// Creates a ULID-compatible buffer (48 bits timestamp + 80 bits randomness)
function createULIDBuffer(): Uint8Array {
  const buf = new Uint8Array(16); // 128 bits total

  // Timestamp (48 bits = 6 bytes)
  const timestamp = BigInt(Date.now());
  buf[0] = Number((timestamp >> BigInt(40)) & BigInt(255));
  buf[1] = Number((timestamp >> BigInt(32)) & BigInt(255));
  buf[2] = Number((timestamp >> BigInt(24)) & BigInt(255));
  buf[3] = Number((timestamp >> BigInt(16)) & BigInt(255));
  buf[4] = Number((timestamp >> BigInt(8)) & BigInt(255));
  buf[5] = Number(timestamp & BigInt(255));

  // Randomness (80 bits = 10 bytes)
  crypto.getRandomValues(buf.subarray(6));

  return buf;
}

// Creates a unique, time-sortable ID with an optional prefix
export const createId = ({ prefix }: { prefix: (typeof prefixes)[number] }) => {
  const buf = createULIDBuffer();
  const id = base32.encode(buf);

  return `${prefix}${id}`;
};
