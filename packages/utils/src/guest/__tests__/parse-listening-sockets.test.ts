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

import { describe, expect, test } from "bun:test";
import { parseListeningSockets } from "../parse-listening-sockets";
import type { ListeningSocket } from "../types";
import { SS_DEBIAN, SS_MINIMAL } from "./fixtures";

const find = (
  sockets: ListeningSocket[],
  port: number,
  address?: string,
): ListeningSocket | undefined =>
  sockets.find(
    (socket) =>
      socket.port === port &&
      (address === undefined || socket.address === address),
  );

describe("parseListeningSockets", () => {
  test("it parses a plain web server", () => {
    const sockets = parseListeningSockets(SS_MINIMAL);

    expect(sockets).toHaveLength(4);
    expect(find(sockets, 443)).toMatchObject({
      protocol: "tcp",
      address: "0.0.0.0",
      port: 443,
      scope: "wildcard",
      family: "ipv4",
      processes: [{ name: "nginx", pid: 890 }],
    });
  });

  test("it separates a database on loopback from a web server on the wildcard", () => {
    // The entire point of reading sockets instead of scanning: this database is
    // unreachable from outside whatever the firewall says, and must never be
    // reported as exposed.
    const sockets = parseListeningSockets(SS_MINIMAL);

    expect(find(sockets, 3306)?.scope).toBe("loopback");
    expect(find(sockets, 80)?.scope).toBe("wildcard");
  });

  test("it skips the header row", () => {
    const sockets = parseListeningSockets(SS_DEBIAN);

    expect(sockets.every((socket) => socket.protocol !== undefined)).toBe(true);
    expect(sockets.some((socket) => socket.raw.startsWith("Netid"))).toBe(
      false,
    );
  });

  test("it keeps UDP listeners, which report UNCONN rather than LISTEN", () => {
    const sockets = parseListeningSockets(SS_DEBIAN);
    const udp = sockets.filter((socket) => socket.protocol === "udp");

    expect(udp).toHaveLength(8);
    expect(find(udp, 5353, "0.0.0.0")).toMatchObject({
      protocol: "udp",
      scope: "wildcard",
      processes: [{ name: "avahi-daemon", pid: 727 }],
    });
  });

  test("it strips an interface scope from the bind address", () => {
    const sockets = parseListeningSockets(SS_DEBIAN);
    const resolved = sockets.filter(
      (socket) => socket.address === "127.0.0.53",
    );

    expect(resolved).toHaveLength(2);
    for (const socket of resolved) {
      expect(socket.scope).toBe("loopback");
      // The scope is gone from the parsed address but survives in `raw`.
      expect(socket.raw).toContain("127.0.0.53%lo");
    }
  });

  test("it treats IPv4-mapped IPv6 loopback as loopback", () => {
    // `[::ffff:127.0.0.1]:3128` is a Squid proxy nobody outside can reach.
    // Reading it as "some IPv6 address" would raise a false exposure warning.
    const sockets = parseListeningSockets(SS_DEBIAN);
    const mapped = sockets.filter((socket) =>
      socket.address.startsWith("::ffff:"),
    );

    expect(mapped).toHaveLength(3);
    for (const socket of mapped) {
      expect(socket.scope).toBe("loopback");
      expect(socket.family).toBe("ipv6");
    }
  });

  test("it unbrackets IPv6 literals without losing their colons", () => {
    const sockets = parseListeningSockets(SS_DEBIAN);

    expect(find(sockets, 50613)).toMatchObject({
      address: "fd7a:115c:a1e0::f539:1454",
      family: "ipv6",
      // A ULA address is bound to one interface, not exposed to the internet -
      // but the parser cannot know that, so it stays `specific`.
      scope: "specific",
    });
  });

  test("it reads the port after the last colon of a bracketed address", () => {
    const sockets = parseListeningSockets(SS_DEBIAN);

    expect(find(sockets, 9666, "::1")).toBeDefined();
    expect(find(sockets, 22, "::")).toMatchObject({
      scope: "wildcard",
      family: "ipv6",
    });
  });

  test("it reports a bare wildcard as belonging to no family in particular", () => {
    const sockets = parseListeningSockets(SS_DEBIAN);

    expect(find(sockets, 36057)).toMatchObject({
      address: "*",
      scope: "wildcard",
      family: "any",
    });
  });

  test("it does not mistake a VPN address for loopback or the internet", () => {
    // 100.94.20.83 is CGNAT space handed out by tailscale.
    const sockets = parseListeningSockets(SS_DEBIAN);

    expect(find(sockets, 80)).toMatchObject({
      address: "100.94.20.83",
      scope: "specific",
      family: "ipv4",
    });
  });

  test("it captures every process holding a socket", () => {
    const sockets = parseListeningSockets(SS_DEBIAN);

    expect(find(sockets, 22, "0.0.0.0")?.processes).toEqual([
      { name: "sshd", pid: 962 },
      { name: "systemd", pid: 1 },
    ]);
  });

  test("it keeps both families of the same service as separate entries", () => {
    // Collapsing them is the analysis layer's call, not the parser's.
    const sockets = parseListeningSockets(SS_DEBIAN);
    const ssh = sockets.filter((socket) => socket.port === 22);

    expect(ssh.map((socket) => socket.address).sort()).toEqual([
      "0.0.0.0",
      "::",
    ]);
  });

  test("it keeps the original line for every socket", () => {
    const sockets = parseListeningSockets(SS_DEBIAN);

    expect(sockets.length).toBeGreaterThan(0);
    for (const socket of sockets) {
      expect(socket.raw).toContain(`:${socket.port}`);
    }
  });

  test("it survives missing process information", () => {
    const sockets = parseListeningSockets(
      "tcp   LISTEN 0      4096         0.0.0.0:22        0.0.0.0:*\n",
    );

    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.processes).toEqual([]);
  });

  test("it skips established connections", () => {
    const sockets = parseListeningSockets(
      "tcp   ESTAB  0      0        10.0.0.5:22       10.0.0.9:51234\n",
    );

    expect(sockets).toEqual([]);
  });

  test("it skips non-IP sockets", () => {
    const sockets = parseListeningSockets(
      "nl    UNCONN 0      0            rtnl:evolution/1 *\nu_str LISTEN 0      4096   /run/dbus.sock 12345 * 0\n",
    );

    expect(sockets).toEqual([]);
  });

  test("it skips a row whose port is not numeric", () => {
    // `ss` without `-n` prints service names. Guessing the port would turn into
    // a wrong firewall rule, so the row is dropped instead.
    const sockets = parseListeningSockets(
      "tcp   LISTEN 0      4096         0.0.0.0:ssh       0.0.0.0:*\n",
    );

    expect(sockets).toEqual([]);
  });

  test("it handles empty and whitespace-only output", () => {
    expect(parseListeningSockets("")).toEqual([]);
    expect(parseListeningSockets("\n\n   \n")).toEqual([]);
  });
});
