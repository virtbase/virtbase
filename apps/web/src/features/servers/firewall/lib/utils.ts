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

import {
  FIRWALL_PROTOCOLS_WITH_PORTS,
  ICMP_TYPE_NAMES,
  ICMPV6_TYPE_NAMES,
} from "@virtbase/utils";

/**
 * Check if the protocol is ICMP.
 *
 * @param proto - The protocol to check.
 * @returns True if the protocol is `icmp` or `ipv6-icmp`.
 */
export const isICMP = (
  proto: string | undefined,
): proto is "icmp" | "ipv6-icmp" =>
  "string" === typeof proto && (proto === "icmp" || proto === "ipv6-icmp");

/**
 * Check if the protocol supports defining source and destination ports.
 *
 * @param proto - The protocol to check.
 * @returns `true` if the protocol supports defining source and destination ports.
 */
export const isProtocolWithPorts = (
  proto: string | undefined,
): proto is (typeof FIRWALL_PROTOCOLS_WITH_PORTS)[number] =>
  "string" === typeof proto &&
  FIRWALL_PROTOCOLS_WITH_PORTS.includes(proto as never);

export const getICMPTypes = (proto: "icmp" | "ipv6-icmp") => {
  return proto === "icmp" ? ICMP_TYPE_NAMES : ICMPV6_TYPE_NAMES;
};
