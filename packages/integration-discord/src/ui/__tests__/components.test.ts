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
  actionButton,
  isLinkableUrl,
  linkButton,
  row,
  select,
} from "../components";

describe("isLinkableUrl", () => {
  test("it accepts the URLs the bot really links to", () => {
    for (const url of [
      "https://app.virtbase.com/servers",
      "https://virtbase.com/en/help/article/discord-integration",
      "https://discord.com/api/oauth2/authorize?client_id=1&scope=bot",
      "http://staging.app.virtbase.com",
    ]) {
      expect(isLinkableUrl(url)).toBe(true);
    }
  });

  test("it rejects a development host", () => {
    // The bug this exists for: Discord rejects the whole message over one bad
    // button URL, and the customer sees "did not respond in time".
    expect(isLinkableUrl("http://app.virtbase.localhost:3000")).toBe(false);
    expect(isLinkableUrl("http://virtbase.localhost:3000/en/help")).toBe(false);
    expect(isLinkableUrl("http://localhost:3000")).toBe(false);
    expect(isLinkableUrl("http://127.0.0.1:3000")).toBe(false);
  });

  test("it rejects a bare hostname, which resolves on nobody else's network", () => {
    expect(isLinkableUrl("http://intranet")).toBe(false);
  });

  test("it rejects a scheme Discord will not open", () => {
    expect(isLinkableUrl("javascript:alert(1)")).toBe(false);
    expect(isLinkableUrl("ftp://virtbase.com")).toBe(false);
    expect(isLinkableUrl("not a url at all")).toBe(false);
    expect(isLinkableUrl("")).toBe(false);
  });

  test("it rejects a URL past Discord's 512-character limit", () => {
    expect(isLinkableUrl(`https://virtbase.com/${"x".repeat(512)}`)).toBe(
      false,
    );
  });
});

describe("linkButton", () => {
  test("a usable URL becomes a link button", () => {
    expect(
      linkButton({ url: "https://virtbase.com", label: "Portal" }),
    ).toMatchObject({ type: 2, style: 5, url: "https://virtbase.com" });
  });

  test("an unusable one is dropped rather than sent", () => {
    expect(
      linkButton({
        url: "http://app.virtbase.localhost:3000",
        label: "Portal",
      }),
    ).toBeUndefined();
  });

  test("a row silently loses the dropped button and keeps the rest", () => {
    const built = row(
      linkButton({
        url: "http://app.virtbase.localhost:3000",
        label: "Portal",
      }),
      linkButton({ url: "https://virtbase.com", label: "Site" }),
    );

    expect(built.components).toHaveLength(1);
    expect(built.components[0]).toMatchObject({ url: "https://virtbase.com" });
  });

  test("a row that loses every button is empty, and messages drop empty rows", () => {
    expect(
      row(linkButton({ url: "http://localhost:3000", label: "Portal" }))
        .components,
    ).toHaveLength(0);
  });
});

describe("empty labels", () => {
  // A missing translation renders as "" and Discord rejects the whole message
  // with BASE_TYPE_BAD_LENGTH, which reaches the customer as "did not respond
  // in time". A worse label is better than no screen.
  test("a button with no label falls back to its action", () => {
    expect(
      actionButton({ feature: "stats", action: "show", label: "" }),
    ).toMatchObject({ label: "show" });
  });

  test("whitespace counts as empty", () => {
    expect(
      actionButton({ feature: "stats", action: "show", label: "   " }),
    ).toMatchObject({ label: "show" });
  });

  test("a link button with no label falls back to where it goes", () => {
    expect(
      linkButton({ url: "https://app.virtbase.com/servers", label: "" }),
    ).toMatchObject({ label: "app.virtbase.com" });
  });

  test("a select option with no label falls back to its value", () => {
    const menu = select({
      feature: "stats",
      action: "timeframe",
      placeholder: "",
      options: [
        { label: "", value: "hour" },
        { label: "Last day", value: "day" },
      ],
    });

    expect(menu.options.map((option) => option.label)).toEqual([
      "hour",
      "Last day",
    ]);
  });

  test("an empty placeholder is omitted rather than sent empty", () => {
    const menu = select({
      feature: "stats",
      action: "timeframe",
      placeholder: "  ",
      options: [{ label: "Last day", value: "day" }],
    });

    expect(menu.placeholder).toBeUndefined();
  });

  test("no component can carry a label Discord would reject", () => {
    const built = [
      actionButton({ feature: "f", action: "a", label: "" }),
      linkButton({ url: "https://virtbase.com", label: "" }),
    ];

    for (const component of built) {
      expect(component?.label?.length).toBeGreaterThan(0);
      expect(component?.label?.length).toBeLessThanOrEqual(80);
    }
  });
});
