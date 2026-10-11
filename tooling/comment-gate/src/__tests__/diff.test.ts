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
import { parseAddedLines } from "../diff";

describe("parseAddedLines", () => {
  test("reads added and changed lines per file, in new-file numbering", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -3 +3 @@ export const a = 1;",
      "-// old",
      "+// new",
      "@@ -10,0 +11,2 @@",
      "+// one",
      "+// two",
      "@@ -20,3 +22,0 @@",
      "-gone",
      "diff --git a/src/b.ts b/src/b.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/src/b.ts",
      "@@ -0,0 +1,2 @@",
      "+const b = 1;",
      "+// b",
    ].join("\n");

    expect(parseAddedLines(diff)).toEqual(
      new Map([
        ["src/a.ts", new Set([3, 11, 12])],
        ["src/b.ts", new Set([1, 2])],
      ]),
    );
  });

  test("reads a header path that holds a space, and never an added ++ line as a header", () => {
    const diff = [
      "diff --git a/src/my file.ts b/src/my file.ts",
      "--- a/src/my file.ts",
      "+++ b/src/my file.ts\t",
      "@@ -1,0 +1,2 @@",
      "+++ counter;",
      "+// two",
    ].join("\n");

    expect(parseAddedLines(diff)).toEqual(
      new Map([["src/my file.ts", new Set([1, 2])]]),
    );
  });

  test("leaves out a deleted file", () => {
    const diff = [
      "diff --git a/src/gone.ts b/src/gone.ts",
      "--- a/src/gone.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-const a = 1;",
      "-const b = 2;",
    ].join("\n");

    expect(parseAddedLines(diff)).toEqual(new Map());
  });
});
