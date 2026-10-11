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

import { IntegrationError } from "@virtbase/integration-sdk";

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

/** The error for an IP outside the reverse zone it was given; a caller bug, never retryable. */
const zoneMismatch = (ip: string, zone: string) =>
  new IntegrationError({
    code: "powerdns.zone_mismatch",
    message: `${ip} is not in the reverse zone ${zone}`,
    params: { ip, zone },
  });

/** Whether `name` is `zone` or a name inside it, compared label by label. */
const isInZone = (name: string, zone: string) =>
  name === zone || name.endsWith(`.${zone}`);

/** An RFC 2317 zone's first label: the delegated range as `<first>/<prefix length>`. */
const CLASSLESS_LABEL = /^(\d+)\/(\d+)$/;

/**
 * Builds the fully-qualified PTR record name for `ip` within `dnsReverseZone`.
 * Throws a `powerdns.zone_mismatch` {@link IntegrationError} when the IP is not
 * in the zone; zones are compared label by label, so `0.10.in-addr.arpa` does
 * not hold `10.10.0.5`.
 *
 * Supports:
 * - standard IPv4 and IPv6 reverse zones;
 * - RFC 2317 classless IPv4 delegation, such as `0/25.1.168.192.in-addr.arpa`:
 *   the rest of the zone must be the IP's parent zone, and the host must lie in
 *   the delegated range, here 0 to 127.
 */
export function buildPtrName(ip: string, dnsReverseZone: string): string {
  const zone = dnsReverseZone.toLowerCase().replace(/\.$/, "");
  const full = (
    ip.includes(":") ? ipv6ToReverseArpa(ip) : ipv4ToReverseArpa(ip)
  ).toLowerCase();

  const [firstLabel = "", ...rest] = zone.split(".");
  const classless = ip.includes(":") ? null : CLASSLESS_LABEL.exec(firstLabel);
  if (classless) {
    const [hostLabel = "", ...parentParts] = full.split(".");
    const first = Number(classless[1]);
    const size = 2 ** (32 - Number(classless[2]));
    const host = Number(hostLabel);
    if (
      parentParts.join(".") !== rest.join(".") ||
      host < first ||
      host >= first + size
    ) {
      throw zoneMismatch(ip, dnsReverseZone);
    }
    return `${hostLabel}.${zone}`;
  }

  if (!isInZone(full, zone)) {
    throw zoneMismatch(ip, dnsReverseZone);
  }
  return full;
}
