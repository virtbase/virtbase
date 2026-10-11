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
  computeShare,
  evaluatePackage,
  formatReport,
  unreadablePackage,
} from "../gate";
import type { FileCoverage } from "../lcov";

const file = ({
  path,
  lines,
  functions,
}: {
  path: string;
  lines: [found: number, hit: number];
  functions: [found: number, hit: number];
}): FileCoverage => ({
  path,
  lines: { found: lines[0], hit: lines[1] },
  functions: { found: functions[0], hit: functions[1] },
});

const THRESHOLDS = { lines: 0.8, functions: 0.8 };

describe("evaluatePackage", () => {
  test("passes a package at or above its thresholds", () => {
    const result = evaluatePackage({
      name: "@virtbase/a",
      thresholds: THRESHOLDS,
      report: [file({ path: "src/a.ts", lines: [10, 8], functions: [5, 4] })],
      unloaded: [],
    });

    expect(result.failures).toEqual([]);
    expect(result.lines).toEqual({ found: 10, hit: 8 });
  });

  test("counts unloaded files into the totals", () => {
    const result = evaluatePackage({
      name: "@virtbase/a",
      thresholds: THRESHOLDS,
      report: [file({ path: "src/a.ts", lines: [10, 10], functions: [5, 5] })],
      unloaded: [file({ path: "src/b.ts", lines: [10, 0], functions: [5, 0] })],
    });

    expect(result.lines).toEqual({ found: 20, hit: 10 });
    expect(result.unloadedFiles).toBe(1);
    expect(result.failures).toEqual([
      "lines at 50.0 %, below 80.0 %",
      "functions at 50.0 %, below 80.0 %",
    ]);
  });

  test("fails a gated package that wrote no report", () => {
    const result = evaluatePackage({
      name: "@virtbase/a",
      thresholds: THRESHOLDS,
      report: null,
      unloaded: [],
    });

    expect(result.failures).toEqual([
      "wrote no coverage/lcov.info; run bun run test:coverage",
    ]);
  });

  test("fails a gated package whose report holds other packages' files", () => {
    const result = evaluatePackage({
      name: "@virtbase/a",
      thresholds: THRESHOLDS,
      report: [
        file({ path: "src/a.ts", lines: [10, 10], functions: [1, 1] }),
        file({ path: "../utils/src/b.ts", lines: [10, 10], functions: [1, 1] }),
      ],
      unloaded: [],
    });

    expect(result.failures).toEqual([
      'its report includes files from other packages, such as ../utils/src/b.ts; add "../**" to coveragePathIgnorePatterns in its bunfig.toml',
    ]);
  });

  test("never fails a package without thresholds", () => {
    const result = evaluatePackage({
      name: "@virtbase/a",
      thresholds: null,
      report: null,
      unloaded: [file({ path: "src/a.ts", lines: [10, 0], functions: [1, 0] })],
    });

    expect(result.failures).toEqual([]);
  });
});

describe("computeShare", () => {
  test("is 1 when there is nothing to run", () => {
    expect(computeShare({ found: 0, hit: 0 })).toBe(1);
  });
});

describe("unreadablePackage", () => {
  test("fails with the error's message", () => {
    const result = unreadablePackage(
      "packages/a",
      new Error("lcov record for src/a.ts: LF is not a count"),
    );

    expect(result.failures).toEqual([
      "could not be read: lcov record for src/a.ts: LF is not a count",
    ]);
    expect(formatReport([result])).toContain(
      "| packages/a | – | – | 0 | **fail**: could not be read: lcov record for src/a.ts: LF is not a count |",
    );
  });
});

describe("formatReport", () => {
  test("renders one row per package with its verdict", () => {
    const report = formatReport([
      evaluatePackage({
        name: "@virtbase/a",
        thresholds: THRESHOLDS,
        report: [file({ path: "src/a.ts", lines: [10, 9], functions: [2, 2] })],
        unloaded: [],
      }),
      evaluatePackage({
        name: "@virtbase/b",
        thresholds: THRESHOLDS,
        report: [file({ path: "src/b.ts", lines: [10, 1], functions: [2, 2] })],
        unloaded: [],
      }),
      evaluatePackage({
        name: "@virtbase/c",
        thresholds: null,
        report: null,
        unloaded: [
          file({ path: "src/c.ts", lines: [4, 0], functions: [1, 0] }),
        ],
      }),
    ]);

    expect(report).toContain(
      "| @virtbase/a | 90.0 % (min 80.0 %) | 100.0 % (min 80.0 %) | 0 | pass |",
    );
    expect(report).toContain(
      "| @virtbase/b | 10.0 % (min 80.0 %) | 100.0 % (min 80.0 %) | 0 | **fail**: lines at 10.0 %, below 80.0 % |",
    );
    expect(report).toContain(
      "| @virtbase/c | 0.0 % | 0.0 % | 1 | no threshold |",
    );
  });
});
