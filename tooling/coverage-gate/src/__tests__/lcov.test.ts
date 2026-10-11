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
import { parseLcov } from "../lcov";

const REPORT = [
  "TN:",
  "SF:src/a.ts",
  "FNF:4",
  "FNH:3",
  "DA:1,1",
  "DA:2,0",
  "LF:10",
  "LH:7",
  "end_of_record",
  "TN:",
  "SF:src/b.ts",
  "LF:2",
  "LH:0",
  "end_of_record",
  "",
].join("\n");

describe("parseLcov", () => {
  test("reads the totals of every record", () => {
    expect(parseLcov(REPORT)).toEqual([
      {
        path: "src/a.ts",
        lines: { found: 10, hit: 7 },
        functions: { found: 4, hit: 3 },
      },
      {
        path: "src/b.ts",
        lines: { found: 2, hit: 0 },
        functions: { found: 0, hit: 0 },
      },
    ]);
  });

  test("returns nothing for an empty report", () => {
    expect(parseLcov("")).toEqual([]);
  });

  test("throws on a count that is not a non-negative integer", () => {
    expect(() => parseLcov("SF:src/a.ts\nLF:ten\nend_of_record\n")).toThrow(
      "lcov record for src/a.ts: LF is not a count",
    );
    expect(() => parseLcov("SF:src/a.ts\nLH:-1\nend_of_record\n")).toThrow(
      "LH is not a count",
    );
  });
});
