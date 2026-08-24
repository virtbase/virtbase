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
import { parseUfwStatus } from "../parse-ufw";
import { UFW_INACTIVE, UFW_NUMBERED, UFW_VERBOSE } from "./fixtures";

describe("parseUfwStatus", () => {
  test("it reads the active flag and the default policy", () => {
    const state = parseUfwStatus(UFW_VERBOSE);

    expect(state.manager).toBe("ufw");
    expect(state.active).toBe(true);
    expect(state.defaultPolicy).toEqual({
      incoming: "DROP",
      outgoing: "ACCEPT",
    });
  });

  test("it does not read `inactive` as active", () => {
    const state = parseUfwStatus(UFW_INACTIVE);

    expect(state.active).toBe(false);
    expect(state.rules).toEqual([]);
  });

  test("it skips the column headers and the dashes under them", () => {
    const state = parseUfwStatus(UFW_VERBOSE);

    expect(state.rules).toHaveLength(7);
    expect(state.rules.some((rule) => rule.raw.startsWith("To"))).toBe(false);
    expect(state.rules.some((rule) => rule.raw.startsWith("--"))).toBe(false);
  });

  test("it maps LIMIT to ACCEPT while keeping the word in the raw line", () => {
    // LIMIT is an allow with rate limiting: for "can this port be reached" it
    // behaves as an allow, and the detail survives in `raw`.
    const state = parseUfwStatus(UFW_VERBOSE);
    const ssh = state.rules[0];

    expect(ssh).toMatchObject({
      action: "ACCEPT",
      direction: "in",
      proto: "tcp",
      dport: "22",
    });
    expect(ssh?.raw).toContain("LIMIT IN");
  });

  test("it keeps a port list as written", () => {
    const state = parseUfwStatus(UFW_VERBOSE);

    expect(state.rules[1]).toMatchObject({
      action: "ACCEPT",
      proto: "tcp",
      dport: "80,443",
    });
  });

  test("it reports a bare port with no protocol rather than guessing one", () => {
    const state = parseUfwStatus(UFW_VERBOSE);

    expect(state.rules[2]).toMatchObject({
      action: "DROP",
      dport: "3306",
      proto: null,
    });
  });

  test("it reads a source CIDR and treats Anywhere as any", () => {
    const state = parseUfwStatus(UFW_VERBOSE);

    expect(state.rules[3]).toMatchObject({
      dport: "5432",
      proto: "tcp",
      sourceAddr: "10.0.0.0/8",
    });
    expect(state.rules[0]?.sourceAddr).toBeNull();
  });

  test("it does not mistake an interface qualifier for an address", () => {
    const state = parseUfwStatus(UFW_VERBOSE);
    const scoped = state.rules[4];

    expect(scoped).toMatchObject({
      dport: "53",
      destAddr: null,
      // Kept rather than discarded: a rule scoped to an interface is not the
      // same as one that applies everywhere.
      iface: "eth0",
    });
    expect(scoped?.raw).toContain("on eth0");
  });

  test("it strips the (v6) marker from both columns", () => {
    const state = parseUfwStatus(UFW_VERBOSE);
    const v6 = state.rules[5];

    expect(v6).toMatchObject({
      dport: "22",
      proto: "tcp",
      sourceAddr: null,
    });
  });

  test("it reads the position from numbered output", () => {
    const state = parseUfwStatus(UFW_NUMBERED);

    expect(state.rules.map((rule) => rule.index)).toEqual([1, 2, 3, 10]);
  });

  test("it reads an outbound rule with a port on the source side", () => {
    const state = parseUfwStatus(UFW_NUMBERED);

    expect(state.rules[2]).toMatchObject({
      direction: "out",
      action: "DROP",
      // ufw states the protocol on whichever side carries the port.
      proto: "tcp",
      sport: "25",
      dport: null,
      destAddr: null,
    });
  });

  test("it splits an address and port sharing the destination column", () => {
    const state = parseUfwStatus(UFW_NUMBERED);

    expect(state.rules[3]).toMatchObject({
      index: 10,
      action: "REJECT",
      direction: "in",
      destAddr: "192.168.0.1",
      dport: "8080",
      proto: "tcp",
      sourceAddr: "203.0.113.0/24",
    });
  });

  test("it keeps the original line for every rule", () => {
    const state = parseUfwStatus(UFW_VERBOSE);

    for (const rule of state.rules) {
      expect(rule.raw.length).toBeGreaterThan(0);
      expect(rule.manager).toBe("ufw");
    }
  });

  test("it handles empty output", () => {
    expect(parseUfwStatus("")).toEqual({
      manager: "ufw",
      active: false,
      defaultPolicy: null,
      rules: [],
    });
  });
});
