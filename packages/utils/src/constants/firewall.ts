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
 * A list of available firewall protocols.
 * Found in `/etc/protocols` on the host.
 */
export const FIRWALL_PROTOCOLS = [
  "tcp",
  "udp",
  "icmp",
  "igmp",
  "ggp",
  "ipencap",
  "st",
  "egp",
  "igp",
  "pup",
  "hmp",
  "xns-idp",
  "rdp",
  "iso-tp4",
  "dccp",
  "xtp",
  "ddp",
  "idpr-cmtp",
  "ipv6",
  "ipv6-route",
  "ipv6-frag",
  "idrp",
  "rsvp",
  "gre",
  "esp",
  "ah",
  "skip",
  "ipv6-icmp",
  "ipv6-nonxt",
  "ipv6-opts",
  "vmtp",
  "eigrp",
  "ospf",
  "ax.25",
  "ipip",
  "etherip",
  "encap",
  "pim",
  "ipcomp",
  "vrrp",
  "l2tp",
  "isis",
  "sctp",
  "fc",
  "mobility-header",
  "udplite",
  "mpls-in-ip",
  "hip",
  "shim6",
  "wesp",
  "rohc",
] as const;

type FirewallProtocol = (typeof FIRWALL_PROTOCOLS)[number];

/**
 * Protocols that support defining source and destination ports.
 *
 * Proxmox Firewall accepts either the name of the protocol or the number. We only define the names here.
 *
 * @see https://github.com/proxmox/pve-firewall/blob/6f1311f349daee920c7eedcc6e53d7fc5e2cfdbf/src/PVE/Firewall.pm#L61
 */
export const FIRWALL_PROTOCOLS_WITH_PORTS: FirewallProtocol[] = [
  "udp",
  "udplite",
  "tcp",
  "dccp",
  "sctp",
] as const;

// ICMP types per: iptables -p icmp -h
export const ICMP_TYPE_NAMES = [
  "any",
  "echo-reply",
  "destination-unreachable",
  "network-unreachable",
  "host-unreachable",
  "protocol-unreachable",
  "port-unreachable",
  "fragmentation-needed",
  "source-route-failed",
  "network-unknown",
  "host-unknown",
  "network-prohibited",
  "host-prohibited",
  "TOS-network-unreachable",
  "TOS-host-unreachable",
  "communication-prohibited",
  "host-precedence-violation",
  "precedence-cutoff",
  "source-quench",
  "redirect",
  "network-redirect",
  "host-redirect",
  "TOS-network-redirect",
  "TOS-host-redirect",
  "echo-request",
  "router-advertisement",
  "router-solicitation",
  "time-exceeded",
  "ttl-zero-during-transit",
  "ttl-zero-during-reassembly",
  "parameter-problem",
  "ip-header-bad",
  "required-option-missing",
  "timestamp-request",
  "timestamp-reply",
  "address-mask-request",
  "address-mask-reply",
] as const;

// ICMPv6 types per: ip6tables -p icmpv6 -h
export const ICMPV6_TYPE_NAMES = [
  "destination-unreachable",
  "no-route",
  "communication-prohibited",
  "beyond-scope",
  "address-unreachable",
  "port-unreachable",
  "failed-policy",
  "reject-route",
  "packet-too-big",
  "time-exceeded",
  "ttl-zero-during-transit",
  "ttl-zero-during-reassembly",
  "parameter-problem",
  "bad-header",
  "unknown-header-type",
  "unknown-option",
  "echo-request",
  "echo-reply",
  "router-solicitation",
  "router-advertisement",
  "neighbor-solicitation",
  "neighbour-solicitation",
  "neighbor-advertisement",
  "neighbour-advertisement",
  "redirect",
] as const;
