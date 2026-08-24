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

export type SocketProtocol = "tcp" | "udp";

/**
 * `any` covers the bare `*` address, which is neither family in particular -
 * a dual-stack socket serving both.
 */
export type IpFamily = "ipv4" | "ipv6" | "any";

/**
 * What a socket's bind address says about who can reach it.
 *
 * This is the distinction the whole open-port feature turns on, and the reason
 * reading sockets inside the guest beats scanning it from outside: a port bound
 * to `127.0.0.1` is unreachable no matter what the firewall allows, while the
 * same port on `0.0.0.0` is one permissive rule away from the internet.
 *
 * `specific` is deliberately not "safe" - it only means the socket is bound to
 * one address. Whether that address is reachable depends on whether it is one
 * of the server's public IPs, which the parser has no way to know.
 */
export type BindScope = "wildcard" | "loopback" | "specific";

export interface SocketProcess {
  name: string;
  /** `null` when the guest reported a process without a usable pid. */
  pid: number | null;
}

export interface ListeningSocket {
  protocol: SocketProtocol;
  /** Bind address with brackets and any `%iface` scope removed. */
  address: string;
  port: number;
  scope: BindScope;
  family: IpFamily;
  /**
   * The processes holding the socket. Empty when the guest did not report them,
   * which happens without `-p` or without the privileges to see other users'
   * processes.
   */
  processes: SocketProcess[];
  /** The original line, kept so the UI can always fall back to showing it. */
  raw: string;
}

/** The host-based firewalls Virtbase knows how to read. */
export type GuestFirewallManager =
  | "ufw"
  | "firewalld"
  | "nftables"
  | "iptables";

/** Proxmox's vocabulary, so host and guest rules can share one table. */
export type FirewallAction = "ACCEPT" | "DROP" | "REJECT";

/**
 * One rule read from a firewall running inside the guest.
 *
 * Every field but `raw` is nullable on purpose. Fully parsing nftables or
 * iptables is not a battle worth fighting, so the contract is: normalise what
 * parses confidently, and always keep the original line so the UI can fall back
 * to showing exactly what the customer would see on their own terminal.
 */
export interface GuestFirewallRule {
  manager: GuestFirewallManager;
  /** Position as the manager numbers it, or `null` when it does not. */
  index: number | null;
  /** The chain or zone the rule sits in, when the manager exposes one. */
  chain: string | null;
  direction: "in" | "out" | null;
  action: FirewallAction | null;
  proto: string | null;
  /** Destination port spec as written, e.g. `22` or `80,443`. */
  dport: string | null;
  sport: string | null;
  /** `null` means "any", however the manager spelled it. */
  sourceAddr: string | null;
  destAddr: string | null;
  /**
   * The interface the rule is scoped to, when it is scoped to one.
   *
   * Load-bearing for analysis rather than decoration: an `ACCEPT` on `lo`
   * exposes nothing, and counting it as an open port would be wrong.
   */
  iface: string | null;
  /** A comment the customer attached to the rule, when the manager keeps one. */
  comment: string | null;
  raw: string;
}

export interface GuestFirewallPolicy {
  incoming: FirewallAction | null;
  outgoing: FirewallAction | null;
}

export interface GuestFirewallState {
  manager: GuestFirewallManager;
  /** Whether the firewall is actually filtering, not merely installed. */
  active: boolean;
  /** `null` when the manager did not report its defaults. */
  defaultPolicy: GuestFirewallPolicy | null;
  rules: GuestFirewallRule[];
}
