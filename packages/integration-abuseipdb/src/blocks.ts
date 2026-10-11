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
import { MAX_CALLS_PER_RUN } from "./manifest";

const IPV4_CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

/**
 * The network address and prefix length of an IPv4 `cidr`, or null for an
 * IPv6 range.
 *
 * @throws IntegrationError `abuseipdb.invalid_target` for anything else: a
 * range without a prefix length would otherwise read as /0, and a non-numeric
 * one as no blocks at all.
 */
const parseIpv4Cidr = (
  cidr: string,
): { network: number; prefix: number } | null => {
  if (cidr.includes(":")) return null;
  const match = IPV4_CIDR.exec(cidr);
  const octets = match ? match.slice(1, 5).map(Number) : [];
  const prefix = match ? Number(match[5]) : Number.NaN;
  if (octets.some((octet) => octet > 255) || !(prefix <= 32)) {
    throw new IntegrationError({
      code: "abuseipdb.invalid_target",
      message: `${cidr} is not an IPv4 or IPv6 range`,
      params: { cidr },
    });
  }
  const address = octets.reduce((value, octet) => value * 256 + octet, 0);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: (address & mask) >>> 0, prefix };
};

/**
 * The number of blocks of `prefixLength` {@link splitIntoBlocks} splits `cidr`
 * into, computed without building them.
 *
 * @throws IntegrationError `abuseipdb.invalid_target` for a malformed range.
 */
export const countBlocks = (cidr: string, prefixLength: number): number => {
  const parsed = parseIpv4Cidr(cidr);
  if (!parsed || parsed.prefix >= prefixLength) return 1;
  return 2 ** (prefixLength - parsed.prefix);
};

/**
 * The blocks of `prefixLength` an IPv4 `cidr` splits into, in address order:
 * `10.0.0.0/22` at 24 is four /24s. A block that is already as narrow or
 * narrower, and any IPv6 range, is returned as it is.
 *
 * @throws IntegrationError `abuseipdb.invalid_target` for a malformed range,
 * and `abuseipdb.target_too_wide` for a split into more than
 * {@link MAX_CALLS_PER_RUN} blocks, which no run can afford.
 */
export const splitIntoBlocks = (
  cidr: string,
  prefixLength: number,
): string[] => {
  const parsed = parseIpv4Cidr(cidr);
  if (!parsed || parsed.prefix >= prefixLength) return [cidr];
  const blocks = countBlocks(cidr, prefixLength);
  if (blocks > MAX_CALLS_PER_RUN) {
    throw new IntegrationError({
      code: "abuseipdb.target_too_wide",
      message: `${cidr} splits into ${blocks} blocks of /${prefixLength}, more than one run may call`,
      params: { cidr, blocks },
    });
  }
  const size = 2 ** (32 - prefixLength);
  return Array.from({ length: blocks }, (_, index) => {
    const start = parsed.network + index * size;
    const dotted = [24, 16, 8, 0]
      .map((shift) => (start >>> shift) & 255)
      .join(".");
    return `${dotted}/${prefixLength}`;
  });
};
