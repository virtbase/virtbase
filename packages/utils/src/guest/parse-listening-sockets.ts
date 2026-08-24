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

import type {
  BindScope,
  IpFamily,
  ListeningSocket,
  SocketProcess,
  SocketProtocol,
} from "./types";

/**
 * The prefix of an IPv4-mapped IPv6 address.
 *
 * These matter more than they look: a JVM listening on `[::ffff:127.0.0.1]`
 * is bound to loopback, and reading it as "some IPv6 address" would raise a
 * false exposure warning on a port nobody outside the machine can reach.
 */
const IPV4_MAPPED_PREFIX = "::ffff:";

/**
 * States that mean "accepting new traffic".
 *
 * TCP listeners report `LISTEN`; UDP is connectionless, so `ss -l` reports its
 * listeners as `UNCONN`. Anything else is an established or closing connection,
 * which says nothing about exposure.
 */
const LISTENING_STATES = new Set(["LISTEN", "UNCONN"]);

const PROTOCOLS: Record<string, SocketProtocol> = {
  tcp: "tcp",
  tcp6: "tcp",
  udp: "udp",
  udp6: "udp",
};

/** `users:(("sshd",pid=962,fd=3),("systemd",pid=1,fd=89))` */
const PROCESS_PATTERN = /\("([^"]*)",pid=(\d+)/g;

/**
 * Strips the brackets around an IPv6 literal and any `%iface` scope suffix.
 *
 * `systemd-resolved` in particular binds `127.0.0.53%lo`, so the scope has to
 * come off before the address can be compared to anything.
 */
const normalizeAddress = (value: string): string => {
  const unbracketed =
    value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;

  const scopeIndex = unbracketed.indexOf("%");

  return scopeIndex === -1 ? unbracketed : unbracketed.slice(0, scopeIndex);
};

const classifyScope = (address: string): BindScope => {
  // Unwrap IPv4-mapped addresses first, so `::ffff:127.0.0.1` is judged by the
  // IPv4 address it actually represents.
  const candidate = address.toLowerCase().startsWith(IPV4_MAPPED_PREFIX)
    ? address.slice(IPV4_MAPPED_PREFIX.length)
    : address;

  if (candidate === "*" || candidate === "0.0.0.0" || candidate === "::") {
    return "wildcard";
  }

  if (candidate === "::1" || candidate.startsWith("127.")) {
    return "loopback";
  }

  return "specific";
};

const detectFamily = (raw: string, normalized: string): IpFamily => {
  if (normalized === "*") {
    return "any";
  }

  return raw.startsWith("[") || normalized.includes(":") ? "ipv6" : "ipv4";
};

const splitAddressPort = (
  value: string,
): { address: string; port: number } | null => {
  // The port always follows the last colon: IPv6 literals are bracketed, so
  // their inner colons cannot be mistaken for the separator.
  const separator = value.lastIndexOf(":");

  if (separator === -1) {
    return null;
  }

  const port = Number.parseInt(value.slice(separator + 1), 10);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return null;
  }

  return { address: value.slice(0, separator), port };
};

const parseProcesses = (value: string): SocketProcess[] => {
  const processes: SocketProcess[] = [];

  for (const [, name, pid] of value.matchAll(PROCESS_PATTERN)) {
    if (name) {
      const parsed = Number.parseInt(pid ?? "", 10);

      processes.push({
        name,
        pid: Number.isInteger(parsed) ? parsed : null,
      });
    }
  }

  return processes;
};

/**
 * Parses the output of `ss -H -ltnup` into listening sockets.
 *
 * Requires the numeric flag: without `-n` the port column carries service
 * names, which cannot be turned back into port numbers reliably. Lines that do
 * not parse are skipped rather than guessed at - a wrong port here becomes a
 * wrong firewall rule later.
 *
 * The result is deliberately faithful rather than tidy: a service listening on
 * both `0.0.0.0:22` and `[::]:22` yields two entries, because collapsing them
 * is a judgement the analysis layer makes with more context than the parser
 * has.
 */
export const parseListeningSockets = (stdout: string): ListeningSocket[] => {
  const sockets: ListeningSocket[] = [];

  for (const line of stdout.split("\n")) {
    const raw = line.trim();

    if (!raw) {
      continue;
    }

    // Netid State Recv-Q Send-Q Local-Address:Port Peer-Address:Port [Process]
    const fields = raw.split(/\s+/);

    if (fields.length < 5) {
      continue;
    }

    const protocol = PROTOCOLS[(fields[0] ?? "").toLowerCase()];

    // Also filters the header row, whose Netid column reads "Netid".
    if (!protocol || !LISTENING_STATES.has(fields[1] ?? "")) {
      continue;
    }

    const local = splitAddressPort(fields[4] ?? "");

    if (!local) {
      continue;
    }

    const address = normalizeAddress(local.address);

    sockets.push({
      protocol,
      address,
      port: local.port,
      scope: classifyScope(address),
      family: detectFamily(local.address, address),
      processes: parseProcesses(fields.slice(6).join(" ")),
      raw,
    });
  }

  return sockets;
};
