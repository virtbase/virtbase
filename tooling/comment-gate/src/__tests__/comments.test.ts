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
import { extractCommentLines } from "../comments";

const LICENCE_HEADER = [
  "/*",
  " *   Copyright (c) 2026 Janic Bellmann",
  " *   along with this program.  If not, see the GNU General Public License.",
  " */",
].join("\n");

describe("extractCommentLines", () => {
  test("lists line, block and doc comments with their line numbers", () => {
    const source = [
      "// first",
      "// second",
      "const a = 1; // trailing",
      "/** Doc.",
      " * More doc.",
      " */",
      "/* plain block */",
    ].join("\n");

    expect(
      extractCommentLines("src/a.ts", source).map(({ line, text, kind }) => [
        line,
        text,
        kind,
      ]),
    ).toEqual([
      [1, "first", "plain"],
      [2, "second", "plain"],
      [3, "trailing", "plain"],
      [4, "Doc.", "doc"],
      [5, "More doc.", "doc"],
      [6, "", "doc"],
      [7, "plain block", "plain"],
    ]);
  });

  test("joins adjacent line comments into one block", () => {
    const [first, second, third] = extractCommentLines(
      "src/a.ts",
      ["// if (ready) {", "//   start();", "", "// }"].join("\n"),
    );

    expect(first).toMatchObject({
      block: "if (ready) {\nstart();",
      blockLine: 1,
    });
    expect(second).toMatchObject({
      block: "if (ready) {\nstart();",
      blockLine: 1,
    });
    expect(third).toMatchObject({ block: "}", blockLine: 4 });
  });

  test("marks the first block comment as the licence when it names the GPL", () => {
    const lines = extractCommentLines(
      "src/a.ts",
      `#!/usr/bin/env bun\n"use client";\n${LICENCE_HEADER}\n/* The GNU General Public License applies. */`,
    );

    expect(lines.filter((line) => line.kind === "licence")).toHaveLength(4);
    expect(lines.at(-1)?.kind).toBe("plain");
  });

  test("records each line's block and the line the block starts on", () => {
    const [first, second] = extractCommentLines(
      "src/a.ts",
      "const a = 1;\n/* one\n * two */",
    );

    expect(first).toMatchObject({ line: 2, block: "one\ntwo", blockLine: 2 });
    expect(second).toMatchObject({ line: 3, block: "one\ntwo", blockLine: 2 });
  });

  test("parses TSX and generic arrows by file extension", () => {
    expect(
      extractCommentLines("src/a.tsx", "const A = () => <b>{/* jsx */}</b>;"),
    ).toHaveLength(1);
    expect(
      extractCommentLines("src/a.ts", "const f = <T,>(x: T) => x; // generic"),
    ).toHaveLength(1);
  });

  test("throws on a file Babel cannot recover", () => {
    expect(() => extractCommentLines("src/a.ts", "const = = ;")).toThrow();
  });
});
