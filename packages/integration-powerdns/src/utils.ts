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

/**
 * Expands a potentially abbreviated IPv6 address into its full 8-group form.
 * Handles `::` zero-compression and IPv4-embedded addresses (e.g. `::ffff:192.168.1.1`).
 */
function expandIPv6Address(address: string): string {
  // Normalise IPv4-embedded suffix (e.g. ::ffff:192.168.1.1 → ::ffff:c0a8:0101)
  const ipv4Match = address.match(
    /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (ipv4Match) {
    const hex = ipv4Match
      .slice(1)
      .map((n) => Number.parseInt(n, 10).toString(16).padStart(2, "0"))
      .join("");
    address = address.replace(
      ipv4Match[0],
      `${hex.slice(0, 4)}:${hex.slice(4)}`,
    );
  }

  const [left = "", right] = address.split("::");
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right ? right.split(":") : [];
  const zeroCount = 8 - leftGroups.length - rightGroups.length;

  return [...leftGroups, ...Array<string>(zeroCount).fill("0"), ...rightGroups]
    .map((group) => group.padStart(4, "0"))
    .join(":");
}

function ipv4ToReverseArpa(ip: string): string {
  return `${ip.split(".").reverse().join(".")}.in-addr.arpa`;
}

function ipv6ToReverseArpa(ip: string): string {
  return `${expandIPv6Address(ip).replace(/:/g, "").split("").reverse().join(".")}.ip6.arpa`;
}

/**
 * Builds the fully-qualified PTR record name for `ip` within `dnsReverseZone`.
 *
 * Supports:
 * - Standard IPv4 and IPv6 reverse zones
 * - RFC 2317 classless IPv4 delegation (zones containing `/`, e.g. `0/25.1.168.192.in-addr.arpa`)
 */
export function buildPtrName(ip: string, dnsReverseZone: string): string {
  const zone = dnsReverseZone.toLowerCase().replace(/\.$/, "");

  if (ip.includes(":")) {
    const full = ipv6ToReverseArpa(ip);
    if (!full.endsWith(zone)) {
      throw new Error("IP does not belong to reverse zone");
    }
    const prefix = full.slice(0, full.length - zone.length - 1);
    return prefix ? `${prefix}.${zone}` : zone;
  }

  const full = ipv4ToReverseArpa(ip);
  const [hostLabel, ...parentParts] = full.split(".");
  const parentZone = parentParts.join(".");

  // RFC 2317 classless delegation — zone contains a slash (e.g. "0/25.1.168.192.in-addr.arpa")
  if (zone.includes("/")) {
    if (!zone.endsWith(parentZone)) {
      throw new Error("Zone does not match IP parent zone");
    }
    return `${hostLabel}.${zone}`;
  }

  if (!full.endsWith(zone)) {
    throw new Error("IP does not belong to reverse zone");
  }
  const prefix = full.slice(0, full.length - zone.length - 1);
  return prefix ? `${prefix}.${zone}` : zone;
}
