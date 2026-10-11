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

import type { FileCoverage } from "./lcov";

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;
const IMPORT_LINE = /^\s*(import\b|export\s*[{*])/;
const FUNCTION = /=>|\bfunction\b/g;
const METHOD =
  /^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?\*?\s*(?!(?:if|for|while|switch|catch|function)\b)[\w$]+\s*\([^)]*\)\s*\{/gm;

/**
 * Estimates the counts of a source file that no test loaded, as fully
 * uncovered.
 *
 * Bun reports only the files a test imports, so a file without tests is
 * otherwise missing from the report and the package total leaves it out. The
 * estimate strips the TypeScript with Bun's transpiler, then counts:
 *
 * - lines: every non-blank line that is not a comment, an import or a
 *   re-export (`export { … }`, `export * from …`);
 * - functions: every `=>` and `function` token, string literals included, and
 *   every line that opens a method body.
 *
 * A type-only file therefore counts as zero. Once a test loads the file, Bun's
 * own counts replace the estimate.
 */
export const estimateUnloadedFile = (
  path: string,
  source: string,
): FileCoverage => {
  const transpiler = new Bun.Transpiler({
    loader: path.endsWith(".tsx") ? "tsx" : "ts",
    trimUnusedImports: true,
  });
  const code = transpiler.transformSync(source);

  const lines = code
    .split("\n")
    .filter(
      (line) =>
        line.trim() !== "" &&
        !COMMENT_LINE.test(line) &&
        !IMPORT_LINE.test(line),
    ).length;
  const functions =
    (code.match(FUNCTION)?.length ?? 0) + (code.match(METHOD)?.length ?? 0);

  return {
    path,
    lines: { found: lines, hit: 0 },
    functions: { found: functions, hit: 0 },
  };
};
