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
import type { GuestRule, HostRule } from "./table-rows";
import { buildFirewallTableRows, countHostRows } from "./table-rows";

const hostRule = (overrides: Partial<HostRule> = {}): HostRule =>
  ({
    pos: 0,
    enabled: true,
    action: "ACCEPT",
    direction: "in",
    proto: "tcp",
    dport: "443",
    comment: "Allow HTTPS",
    ...overrides,
  }) as HostRule;

const guestRule = (overrides: Partial<GuestRule> = {}): GuestRule =>
  ({
    manager: "ufw",
    index: 1,
    chain: null,
    direction: "in",
    action: "ACCEPT",
    proto: "tcp",
    dport: "22",
    sport: null,
    source_addr: null,
    dest_addr: null,
    iface: null,
    comment: null,
    raw: "22/tcp                     ALLOW IN    Anywhere",
    ...overrides,
  }) as GuestRule;

describe("buildFirewallTableRows", () => {
  test("it puts host rules before guest rules", () => {
    // The order is the packet's path: the Virtbase firewall sees inbound
    // traffic before anything inside the server does.
    const rows = buildFirewallTableRows({
      hostRules: [hostRule()],
      guestRules: [guestRule()],
    });

    expect(rows.map((row) => row.layer)).toEqual(["host", "guest"]);
  });

  test("it maps a host rule without losing the original", () => {
    const rule = hostRule({ pos: 2, enabled: false });
    const [row] = buildFirewallTableRows({ hostRules: [rule] });

    expect(row).toMatchObject({
      layer: "host",
      pos: 2,
      enabled: false,
      action: "ACCEPT",
      dport: "443",
    });
    // The edit dialog needs the untouched rule, digest included.
    expect(row?.layer === "host" && row.rule).toBe(rule);
  });

  test("it treats an undefined enabled flag as disabled", () => {
    const [row] = buildFirewallTableRows({
      hostRules: [hostRule({ enabled: undefined })],
    });

    expect(row?.layer === "host" && row.enabled).toBe(false);
  });

  test("it keeps the raw line of a guest rule", () => {
    const [row] = buildFirewallTableRows({ guestRules: [guestRule()] });

    expect(row).toMatchObject({
      layer: "guest",
      manager: "ufw",
      dport: "22",
      raw: "22/tcp                     ALLOW IN    Anywhere",
    });
  });

  test("it gives every row a distinct key", () => {
    // Guest rules do not always carry an index, so two otherwise identical
    // rules would collide on key and make React reorder rows on refetch.
    const rows = buildFirewallTableRows({
      hostRules: [hostRule({ pos: 0 }), hostRule({ pos: 1 })],
      guestRules: [
        guestRule({ index: null }),
        guestRule({ index: null }),
        guestRule({ index: 3 }),
      ],
    });

    const keys = rows.map((row) => row.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  test("it handles either side being absent", () => {
    expect(buildFirewallTableRows({})).toEqual([]);
    expect(buildFirewallTableRows({ hostRules: [hostRule()] })).toHaveLength(1);
    expect(buildFirewallTableRows({ guestRules: [guestRule()] })).toHaveLength(
      1,
    );
  });
});

describe("countHostRows", () => {
  test("it counts only the rules the customer can reorder", () => {
    // This bounds the "move down" button. Counting guest rows too would let a
    // customer move the last host rule past the end of the Proxmox ruleset.
    const rows = buildFirewallTableRows({
      hostRules: [hostRule({ pos: 0 }), hostRule({ pos: 1 })],
      guestRules: [guestRule(), guestRule({ index: 2 })],
    });

    expect(countHostRows(rows)).toBe(2);
  });

  test("it returns zero when there are no host rules", () => {
    expect(
      countHostRows(buildFirewallTableRows({ guestRules: [guestRule()] })),
    ).toBe(0);
  });
});
