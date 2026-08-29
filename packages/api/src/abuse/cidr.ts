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
 * IPv4 only, and deliberately so.
 *
 * The one consumer is the AbuseIPDB sweep, whose block endpoint is an IPv4
 * endpoint. Pretending to handle v6 here would produce ranges nothing can ask
 * about.
 */

const toInt = (address: string): number | null => {
  const parts = address.split(".");
  if (4 !== parts.length) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number.parseInt(part, 10);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }

  return value;
};

const toAddress = (value: number): string =>
  [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");

/** Ranges that are never ours to report on, and never routable. */
const RESERVED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export interface ParsedCidr {
  address: number;
  prefixLength: number;
}

export const parseIpv4Cidr = (cidr: string): ParsedCidr | null => {
  const [address, prefix] = cidr.trim().split("/");
  if (!address) return null;

  const value = toInt(address);
  if (null === value) return null;

  const prefixLength = undefined === prefix ? 32 : Number.parseInt(prefix, 10);
  if (
    !Number.isInteger(prefixLength) ||
    prefixLength < 0 ||
    prefixLength > 32
  ) {
    return null;
  }

  return { address: value, prefixLength };
};

/**
 * Whether an address is one somebody could actually report.
 *
 * The documentation ranges are excluded along with the private ones, which
 * matters because they are exactly what the tests use - a sweep that asked
 * AbuseIPDB about `203.0.113.0/24` would be spending real quota on a range
 * that cannot host anything.
 */
export const isPublicIpv4 = (cidr: string): boolean => {
  const parsed = parseIpv4Cidr(cidr);
  if (null === parsed) return false;

  return !RESERVED.some(([reservedAddress, reservedPrefix]) => {
    const reserved = toInt(reservedAddress);
    if (null === reserved) return false;

    const mask = 0 === reservedPrefix ? 0 : (-1 << (32 - reservedPrefix)) >>> 0;
    return (parsed.address & mask) >>> 0 === (reserved & mask) >>> 0;
  });
};

/**
 * The enclosing block of a given size.
 *
 * A fleet's addresses are stored as one subnet per server, so sweeping them
 * directly would spend one provider call per customer. Rolling them up to the
 * block the provider actually accepts turns a thousand calls into four.
 *
 * Returns `null` for a subnet already wider than the requested block: asking
 * about a /16 when only /24s are allowed is a call that fails rather than one
 * that covers more.
 */
export const supernet = (cidr: string, prefixLength: number): string | null => {
  const parsed = parseIpv4Cidr(cidr);
  if (null === parsed) return null;
  if (parsed.prefixLength < prefixLength) return null;

  const mask = 0 === prefixLength ? 0 : (-1 << (32 - prefixLength)) >>> 0;
  return `${toAddress((parsed.address & mask) >>> 0)}/${prefixLength}`;
};
