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

import type { DiscordClient } from "../../api";
import { createEmojiResolver, emptyEmojiResolver } from "../resolver";

const clientWith = (answer: unknown | (() => never)): DiscordClient => ({
  appId: "app_1",
  request: async () => {
    if (typeof answer === "function") return (answer as () => never)();
    return answer as never;
  },
});

const live = clientWith({
  items: [
    { id: "1", name: "vb_debian" },
    { id: "2", name: "vb_ubuntu" },
    { id: "3", name: "vb_windows" },
    { id: "4", name: "vb_almalinux" },
    { id: "5", name: "vb_centos" },
  ],
});

describe("createEmojiResolver", () => {
  test("matches on a template name", async () => {
    const resolver = await createEmojiResolver(live);

    expect(resolver.forTemplate({ name: "Debian 12 (Bookworm)" })).toBe(
      "<:vb_debian:1>",
    );
  });

  test("matches on an icon path when the name says nothing useful", async () => {
    const resolver = await createEmojiResolver(live);

    expect(
      resolver.forTemplate({
        name: "Company standard image",
        icon: "/assets/static/distros/ubuntu.svg",
      }),
    ).toBe("<:vb_ubuntu:2>");
  });

  test("a more specific distro wins over the family it names", async () => {
    // AlmaLinux describes itself as CentOS-compatible; matching `centos` first
    // would give every Alma template the wrong logo.
    const resolver = await createEmojiResolver(live);

    expect(resolver.forTemplate({ name: "AlmaLinux 9" })).toBe(
      "<:vb_almalinux:4>",
    );
    expect(resolver.forTemplate({ name: "CentOS Stream 9" })).toBe(
      "<:vb_centos:5>",
    );
  });

  test("renders nothing rather than broken markup for an unknown OS", async () => {
    const resolver = await createEmojiResolver(live);

    expect(resolver.forTemplate({ name: "TempleOS" })).toBe("");
    expect(resolver.forTemplate(null)).toBe("");
    expect(resolver.forTemplate({ name: null, icon: null })).toBe("");
  });

  test("renders nothing for a declared emoji that was never uploaded", async () => {
    const resolver = await createEmojiResolver(clientWith({ items: [] }));

    expect(resolver.forTemplate({ name: "Debian 12" })).toBe("");
  });

  test("a Discord that will not answer costs the logos, not the message", async () => {
    const warnings: string[] = [];
    const resolver = await createEmojiResolver(
      clientWith(() => {
        throw new Error("503");
      }),
      { warn: (message) => warnings.push(message) },
    );

    expect(resolver.forTemplate({ name: "Debian 12" })).toBe("");
    expect(warnings).toHaveLength(1);
  });

  test("componentForTemplate gives components the object form they need", async () => {
    // A select option carries `{ id, name }`, not the markup an embed uses.
    const resolver = await createEmojiResolver(live);

    expect(resolver.componentForTemplate({ name: "Ubuntu 24.04" })).toEqual({
      id: "2",
      name: "vb_ubuntu",
      animated: undefined,
    });
    expect(resolver.componentForTemplate({ name: "TempleOS" })).toBeUndefined();
  });

  test("byName finds a fixed emoji", async () => {
    const resolver = await createEmojiResolver(live);

    expect(resolver.byName("vb_windows")).toBe("<:vb_windows:3>");
    expect(resolver.byName("vb_nothing")).toBe("");
  });
});

test("emptyEmojiResolver renders nothing at all", () => {
  expect(emptyEmojiResolver.forTemplate({ name: "Debian" })).toBe("");
  expect(
    emptyEmojiResolver.componentForTemplate({ name: "Debian" }),
  ).toBeUndefined();
  expect(emptyEmojiResolver.byName("vb_debian")).toBe("");
});

describe("forOperatingSystem", () => {
  test("it renders the emoji for a resolved slug", async () => {
    const resolver = await createEmojiResolver(live);

    expect(resolver.forOperatingSystem({ slug: "debian" })).toBe(
      "<:vb_debian:1>",
    );
  });

  test("it takes the slug at face value rather than re-guessing", async () => {
    // The API already decided this server runs Ubuntu; the bot must agree with
    // the dashboard instead of matching a name for itself.
    const resolver = await createEmojiResolver(live);

    expect(resolver.forOperatingSystem({ slug: "ubuntu" })).toBe(
      "<:vb_ubuntu:2>",
    );
  });

  test("an unresolved, absent or never-uploaded operating system renders nothing", async () => {
    const resolver = await createEmojiResolver(live);

    expect(resolver.forOperatingSystem({ slug: null })).toBe("");
    expect(resolver.forOperatingSystem(null)).toBe("");
    expect(resolver.forOperatingSystem(undefined)).toBe("");
    // In the catalog, but no emoji was uploaded for it.
    expect(resolver.forOperatingSystem({ slug: "kali" })).toBe("");
  });

  test("the empty resolver renders nothing", () => {
    expect(emptyEmojiResolver.forOperatingSystem({ slug: "debian" })).toBe("");
  });
});
