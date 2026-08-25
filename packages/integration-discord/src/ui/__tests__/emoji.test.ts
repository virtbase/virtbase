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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { EMOJI, isRenderableEmoji } from "../emoji";

describe("isRenderableEmoji", () => {
  test("it accepts emoji from the emoji planes", () => {
    for (const value of ["🖥️", "💾", "🔄", "🌐", "🏅"]) {
      expect(isRenderableEmoji(value), value).toBe(true);
    }
  });

  test("it accepts a text symbol carrying the variation selector", () => {
    expect(isRenderableEmoji("◀️")).toBe(true);
    expect(isRenderableEmoji("⏹️")).toBe(true);
  });

  test("it accepts the few BMP characters that are emoji on their own", () => {
    expect(isRenderableEmoji("⚡")).toBe(true);
    expect(isRenderableEmoji("➕")).toBe(true);
    expect(isRenderableEmoji("⛔")).toBe(true);
  });

  test("it rejects a technical symbol wearing an emoji costume", () => {
    // U+23FB POWER SYMBOL. Looks right in an editor, and Discord answers
    // COMPONENT_INVALID_EMOJI and discards the whole message.
    expect(isRenderableEmoji("⏻")).toBe(false);
    // A few of the same shape.
    expect(isRenderableEmoji("⏼")).toBe(false);
    expect(isRenderableEmoji("⌨")).toBe(false);
  });

  test("it rejects things that are not a single emoji", () => {
    expect(isRenderableEmoji("")).toBe(false);
    expect(isRenderableEmoji("ab")).toBe(false);
    expect(isRenderableEmoji("🖥️🖥️")).toBe(false);
  });
});

test("every emoji in EMOJI is one Discord will render", () => {
  for (const [name, value] of Object.entries(EMOJI)) {
    expect(isRenderableEmoji(value), `${name}: ${value}`).toBe(true);
  }
});

/**
 * The rule the centralisation exists to enforce.
 *
 * An emoji written inline at a call site is one nothing checks, and the failure
 * mode is a whole screen that never renders.
 */
test("no feature writes an emoji inline instead of using EMOJI", () => {
  const root = join(import.meta.dir, "../..");

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        return entry === "__tests__" ? [] : walk(path);
      }
      return path.endsWith(".ts") ? [path] : [];
    });

  const offenders: string[] = [];
  for (const file of walk(root)) {
    if (file.endsWith("ui/emoji.ts")) continue;

    for (const [index, line] of readFileSync(file, "utf8")
      .split("\n")
      .entries()) {
      // `emoji: "..."` with a literal rather than a reference to EMOJI.
      const match = /emoji: "([^"]*)"/.exec(line);
      if (match) {
        offenders.push(`${file.replace(root, "")}:${index + 1} ${match[1]}`);
      }
    }
  }

  expect(offenders).toEqual([]);
});
