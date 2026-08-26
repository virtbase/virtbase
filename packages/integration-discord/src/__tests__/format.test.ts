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
import { escapeMarkdown } from "../ui/format";

describe("escapeMarkdown", () => {
  test("it leaves an ordinary operating system name alone", () => {
    // Nothing in a real PRETTY_NAME is markup, so nothing should change.
    expect(escapeMarkdown("Debian GNU/Linux 13 (trixie)")).toBe(
      "Debian GNU/Linux 13 \\(trixie\\)",
    );
  });

  test("it defuses a link a guest could otherwise render", () => {
    // `/etc/os-release` is written by whoever controls the server, and an
    // embed field renders markdown - this is the case that matters.
    const escaped = escapeMarkdown("[Click here](https://evil.example)");

    expect(escaped).not.toContain("](");
    expect(escaped).toContain("\\[");
    expect(escaped).toContain("\\]");
  });

  test("it defuses emphasis, code and spoilers", () => {
    expect(escapeMarkdown("**bold**")).toBe("\\*\\*bold\\*\\*");
    expect(escapeMarkdown("`code`")).toBe("\\`code\\`");
    expect(escapeMarkdown("||spoiler||")).toBe("\\|\\|spoiler\\|\\|");
    expect(escapeMarkdown("~~strike~~")).toBe("\\~\\~strike\\~\\~");
  });

  test("it defuses a masked link written with angle brackets", () => {
    const escaped = escapeMarkdown("<https://evil.example>");

    expect(escaped).toBe("\\<https://evil.example\\>");
  });

  test("it defuses headings and list markers", () => {
    expect(escapeMarkdown("# Heading")).toBe("\\# Heading");
    expect(escapeMarkdown("- item")).toBe("\\- item");
  });

  test("it escapes a backslash so an escape cannot be escaped away", () => {
    expect(escapeMarkdown("a\\*b*")).toBe("a\\\\\\*b\\*");
  });

  test("an empty string stays empty", () => {
    expect(escapeMarkdown("")).toBe("");
  });
});
