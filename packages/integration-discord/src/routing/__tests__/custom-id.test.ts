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

import {
  CustomIdError,
  decodeCustomId,
  encodeCustomId,
  MAX_CUSTOM_ID_LENGTH,
  routeKey,
} from "../custom-id";

describe("encodeCustomId", () => {
  test("round-trips a route with parameters", () => {
    const encoded = encodeCustomId({
      kind: "button",
      feature: "backups",
      action: "restore",
      params: [
        "srv_1KECN6RQ2MHEMQV0E62050P88",
        "kbu_1KECN6RQ2MHEMQV0E62050P88",
      ],
    });

    expect(decodeCustomId(encoded)).toEqual({
      kind: "button",
      feature: "backups",
      action: "restore",
      params: [
        "srv_1KECN6RQ2MHEMQV0E62050P88",
        "kbu_1KECN6RQ2MHEMQV0E62050P88",
      ],
    });
  });

  test("a real server and backup id still fit in Discord's limit", () => {
    const encoded = encodeCustomId({
      kind: "button",
      feature: "backups",
      action: "delete-confirm",
      params: [
        "srv_1KECN6RQ2MHEMQV0E62050P88",
        "kbu_1KECN6RQ2MHEMQV0E62050P88",
      ],
    });

    expect(encoded.length).toBeLessThanOrEqual(MAX_CUSTOM_ID_LENGTH);
  });

  test("refuses an id Discord would reject, rather than drawing a dead button", () => {
    expect(() =>
      encodeCustomId({
        kind: "button",
        feature: "backups",
        action: "restore",
        params: ["x".repeat(MAX_CUSTOM_ID_LENGTH)],
      }),
    ).toThrow(CustomIdError);
  });

  test("refuses a separator in a field, which would silently reshape the route", () => {
    expect(() =>
      encodeCustomId({ kind: "button", feature: "a:b", action: "c" }),
    ).toThrow(CustomIdError);

    expect(() =>
      encodeCustomId({
        kind: "button",
        feature: "a",
        action: "b",
        params: ["c|d"],
      }),
    ).toThrow(CustomIdError);
  });
});

describe("decodeCustomId", () => {
  test("omits params entirely when there are none", () => {
    expect(
      encodeCustomId({ kind: "button", feature: "menu", action: "home" }),
    ).toBe("button:menu:home");
    expect(decodeCustomId("button:menu:home")?.params).toEqual([]);
  });

  test("returns null for a stale or foreign id instead of throwing", () => {
    // A button from a message sent before a deploy renamed its route.
    expect(decodeCustomId("")).toBeNull();
    expect(decodeCustomId("button:menu")).toBeNull();
    expect(decodeCustomId("legacy-thing")).toBeNull();
  });

  test("rejects an id of the wrong kind", () => {
    expect(decodeCustomId("modal:servers:password:srv_1", "button")).toBeNull();
    expect(decodeCustomId("button:servers:list", "button")).not.toBeNull();
  });
});

test("routeKey is the pair the handler tables are keyed by", () => {
  expect(routeKey({ feature: "power", action: "run" })).toBe("power:run");
});
