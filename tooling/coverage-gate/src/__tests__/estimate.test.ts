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
import { estimateUnloadedFile } from "../estimate";

describe("estimateUnloadedFile", () => {
  test("counts code lines and functions as uncovered", () => {
    const source = [
      'import { join } from "node:path";',
      "",
      "// A comment line.",
      "/** A doc comment. */",
      "export const twice = (value: number) => value * 2;",
      "export function path(name: string) {",
      '  return join("src", name);',
      "}",
      "export const adapter = {",
      "  async read(id: string) {",
      "    if (id) {",
      "      return id;",
      "    }",
      "    return null;",
      "  },",
      "};",
    ].join("\n");

    const estimate = estimateUnloadedFile("src/a.ts", source);

    expect(estimate.path).toBe("src/a.ts");
    expect(estimate.lines.hit).toBe(0);
    expect(estimate.lines.found).toBeGreaterThanOrEqual(10);
    expect(estimate.functions).toEqual({ found: 3, hit: 0 });
  });

  test("counts a type-only file as zero", () => {
    const source = [
      'import type { Counts } from "./lcov";',
      "export interface Report { counts: Counts }",
      'export type Status = "pass" | "fail";',
    ].join("\n");

    expect(estimateUnloadedFile("src/types.ts", source)).toEqual({
      path: "src/types.ts",
      lines: { found: 0, hit: 0 },
      functions: { found: 0, hit: 0 },
    });
  });

  test("counts a barrel of re-exports as zero lines", () => {
    const source = [
      'export * from "./a";',
      'export * as b from "./b";',
      'export { c } from "./c";',
    ].join("\n");

    expect(estimateUnloadedFile("src/index.ts", source).lines.found).toBe(0);
  });

  test("reads JSX in a .tsx file", () => {
    const source = "export const Badge = () => <span>new</span>;";

    expect(estimateUnloadedFile("src/badge.tsx", source).functions.found).toBe(
      1,
    );
  });
});
