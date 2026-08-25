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

import { beforeEach, describe, expect, test } from "bun:test";

import type { DiscordClient } from "../../api";
import {
  getEmojiResolver,
  invalidateEmojiCache,
  refreshEmojiCache,
} from "../cache";

const clientCounting = (
  items: { id: string; name: string }[] = [{ id: "1", name: "vb_debian" }],
) => {
  let calls = 0;

  const client: DiscordClient = {
    appId: "app_1",
    request: async () => {
      calls += 1;
      return { items } as never;
    },
  };

  return { client, calls: () => calls };
};

beforeEach(() => {
  invalidateEmojiCache();
});

describe("the emoji cache", () => {
  test("a cold cache answers immediately rather than waiting for Discord", () => {
    // This is the whole point: an interaction has three seconds, and fetching
    // the emoji list on every one made the bot answer "did not respond in
    // time". The first interaction renders without logos instead.
    const { client, calls } = clientCounting();

    const resolver = getEmojiResolver(client);

    expect(resolver.forTemplate({ name: "Debian 12" })).toBe("");
    expect(calls()).toBe(1); // started, not awaited
  });

  test("once warm it resolves without touching the network again", async () => {
    const { client, calls } = clientCounting();

    await refreshEmojiCache(client);

    expect(getEmojiResolver(client).forTemplate({ name: "Debian 12" })).toBe(
      "<:vb_debian:1>",
    );
    expect(getEmojiResolver(client).forTemplate({ name: "Debian 12" })).toBe(
      "<:vb_debian:1>",
    );
    expect(calls()).toBe(1);
  });

  test("concurrent refreshes collapse into one request", async () => {
    const { client, calls } = clientCounting();

    await Promise.all([
      refreshEmojiCache(client),
      refreshEmojiCache(client),
      refreshEmojiCache(client),
    ]);

    expect(calls()).toBe(1);
  });

  test("a failed refresh leaves the bot answering, without logos", async () => {
    const failing: DiscordClient = {
      appId: "app_1",
      request: async () => {
        throw new Error("503");
      },
    };

    await refreshEmojiCache(failing, { warn: () => {} });

    expect(
      getEmojiResolver(failing, { warn: () => {} }).byName("vb_debian"),
    ).toBe("");
  });

  test("invalidating picks up a newly uploaded emoji", async () => {
    const first = clientCounting([]);
    await refreshEmojiCache(first.client);
    expect(getEmojiResolver(first.client).byName("vb_debian")).toBe("");

    // What the reconciler does after an upload.
    invalidateEmojiCache();

    const second = clientCounting([{ id: "9", name: "vb_debian" }]);
    await refreshEmojiCache(second.client);
    expect(getEmojiResolver(second.client).byName("vb_debian")).toBe(
      "<:vb_debian:9>",
    );
  });
});
