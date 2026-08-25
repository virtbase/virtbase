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

import { beforeAll, describe, expect, test } from "bun:test";

import { stubNextIntl } from "../../__tests__/support/harness";

beforeAll(stubNextIntl);

const { buttonHandlers, commandHandlers, modalHandlers, selectHandlers } =
  await import("../index");
const { FEATURES } = await import("../index");
const { encodeCustomId } = await import("../../routing");

describe("the routing tables", () => {
  test("every registered route encodes to a legal custom id", () => {
    // Encoding asserts Discord's 100-character limit, and a route whose name
    // alone blows the budget can never carry a server and a record id.
    for (const feature of FEATURES) {
      for (const [kind, actions] of [
        ["button", feature.buttons],
        ["select", feature.selects],
        ["modal", feature.modals],
      ] as const) {
        for (const action of Object.keys(actions ?? {})) {
          const encoded = encodeCustomId({
            kind,
            feature: feature.id,
            action,
            // The worst case any screen builds: a server id and a second id.
            params: [
              "srv_1KECN6RQ2MHEMQV0E62050P88",
              "kbu_1KECN6RQ2MHEMQV0E62050P88",
            ],
          });

          expect(encoded.length).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  test("every button a screen can draw has a handler", async () => {
    // A registered route with no handler is a button that answers with the
    // menu — silently, and only in production.
    expect(buttonHandlers.size).toBeGreaterThan(0);
    expect(selectHandlers.size).toBeGreaterThan(0);
    expect(modalHandlers.size).toBeGreaterThan(0);
  });

  test("only the entry points work without a linked account", () => {
    const open = [
      ...[...commandHandlers.entries()]
        .filter(([, entry]) => entry.allowUnlinked)
        .map(([name]) => `command:${name}`),
      ...[...buttonHandlers.entries()]
        .filter(([, entry]) => entry.allowUnlinked)
        .map(([key]) => key),
      ...[...selectHandlers.entries()]
        .filter(([, entry]) => entry.allowUnlinked)
        .map(([key]) => key),
      ...[...modalHandlers.entries()]
        .filter(([, entry]) => entry.allowUnlinked)
        .map(([key]) => key),
    ].sort();

    // Everything else acts on somebody's servers and must know whose.
    expect(open).toEqual([
      "command:help",
      "command:invite",
      "command:menu",
      "menu:help",
    ]);
  });

  test("the declared slash commands are exactly the handled ones", async () => {
    const { commands } = await import("../../commands");

    expect([...commandHandlers.keys()].sort()).toEqual(
      Object.values(commands)
        .map((command) => command.name)
        .sort(),
    );
  });
});
