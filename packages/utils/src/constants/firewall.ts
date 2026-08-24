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

export type FirewallProtocol = (typeof FIRWALL_PROTOCOLS)[number];

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

/**
 * Severity of a finding about a server's exposure.
 *
 * `critical` is reserved for services that are dangerous the moment they are
 * reachable from the internet - an unauthenticated database, a container API.
 * Everything else is `warning` or `info`, because a security list nobody reads
 * protects nobody.
 */
export type ExposureSeverity = "critical" | "warning" | "info";

export interface SensitivePort {
  port: number;
  proto: "tcp" | "udp";
  /** Shown to the customer, so a recognisable product name rather than a slug. */
  service: string;
  severity: Exclude<ExposureSeverity, "info">;
}

/**
 * Ports worth warning about when they are reachable from the internet.
 *
 * Deliberately short. Ports 22, 80 and 443 are missing on purpose: they are
 * open on almost every server by design, and a list that flags them trains
 * customers to ignore the whole feature. Only services that are dangerous
 * *because* they are reachable earn a place here - datastores that ship without
 * authentication, control-plane APIs that grant root, remote desktops, and the
 * UDP services routinely abused for reflection attacks.
 */
export const SENSITIVE_PORTS: readonly SensitivePort[] = [
  // Datastores - unauthenticated by default in most distributions
  {
    port: 3306,
    proto: "tcp",
    service: "MySQL / MariaDB",
    severity: "critical",
  },
  { port: 5432, proto: "tcp", service: "PostgreSQL", severity: "critical" },
  { port: 27017, proto: "tcp", service: "MongoDB", severity: "critical" },
  { port: 6379, proto: "tcp", service: "Redis", severity: "critical" },
  { port: 11211, proto: "tcp", service: "Memcached", severity: "critical" },
  { port: 9200, proto: "tcp", service: "Elasticsearch", severity: "critical" },
  { port: 5984, proto: "tcp", service: "CouchDB", severity: "critical" },
  { port: 9042, proto: "tcp", service: "Cassandra", severity: "critical" },
  { port: 8086, proto: "tcp", service: "InfluxDB", severity: "critical" },
  {
    port: 1433,
    proto: "tcp",
    service: "Microsoft SQL Server",
    severity: "critical",
  },
  {
    port: 1521,
    proto: "tcp",
    service: "Oracle Database",
    severity: "critical",
  },
  // Control planes - reaching these usually means root on the host
  { port: 2375, proto: "tcp", service: "Docker API", severity: "critical" },
  {
    port: 2376,
    proto: "tcp",
    service: "Docker API (TLS)",
    severity: "warning",
  },
  { port: 2379, proto: "tcp", service: "etcd", severity: "critical" },
  { port: 10250, proto: "tcp", service: "Kubelet", severity: "critical" },
  // Message brokers and their admin interfaces
  { port: 5672, proto: "tcp", service: "RabbitMQ", severity: "critical" },
  {
    port: 15672,
    proto: "tcp",
    service: "RabbitMQ management",
    severity: "critical",
  },
  // Remote access and file sharing
  { port: 5900, proto: "tcp", service: "VNC", severity: "critical" },
  { port: 3389, proto: "tcp", service: "Remote Desktop", severity: "warning" },
  { port: 445, proto: "tcp", service: "SMB", severity: "critical" },
  { port: 139, proto: "tcp", service: "NetBIOS", severity: "critical" },
  { port: 111, proto: "tcp", service: "rpcbind", severity: "warning" },
  // UDP services abused for reflection and amplification attacks
  { port: 53, proto: "udp", service: "DNS resolver", severity: "warning" },
  { port: 123, proto: "udp", service: "NTP", severity: "warning" },
  { port: 161, proto: "udp", service: "SNMP", severity: "critical" },
  { port: 1900, proto: "udp", service: "SSDP", severity: "critical" },
  { port: 11211, proto: "udp", service: "Memcached", severity: "critical" },
] as const;

/**
 * Looks up a port in the catalogue.
 */
export const findSensitivePort = (
  port: number,
  proto: "tcp" | "udp",
): SensitivePort | undefined =>
  SENSITIVE_PORTS.find((entry) => entry.port === port && entry.proto === proto);

/**
 * The protocols rule generation may choose from.
 *
 * A deliberate subset of {@link FIRWALL_PROTOCOLS}. Handing a model 51 enum
 * values to pick from is most of why generated rules come back wrong: the list
 * is long enough to invent entries from, and almost none of it is anything a
 * customer would ever write a rule about. The manual dialog keeps the full set.
 */
export const GENERATED_FIREWALL_PROTOCOLS = [
  "tcp",
  "udp",
  "icmp",
  "ipv6-icmp",
  "gre",
  "esp",
  "ah",
  "sctp",
  "igmp",
] as const satisfies readonly FirewallProtocol[];

/**
 * The ICMP types rule generation may choose from.
 *
 * `any` is valid with `icmp` only - ICMPv6 has no such type - which the system
 * prompt states and the schema rejects.
 */
export const GENERATED_ICMP_TYPES = [
  "any",
  "echo-request",
  "echo-reply",
  "destination-unreachable",
  "time-exceeded",
  // The `satisfies` keeps this a real subset: a typo here would otherwise
  // produce a value the firewall rejects only once a customer applies the rule.
] as const satisfies readonly (typeof ICMP_TYPE_NAMES)[number][];
