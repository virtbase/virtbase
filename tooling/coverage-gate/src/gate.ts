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

import type { Counts, FileCoverage } from "./lcov";

/** The minimum share of lines and of functions, each between 0 and 1. */
export interface Thresholds {
  lines: number;
  functions: number;
}

/** What the gate knows about one workspace package. */
export interface PackageInput {
  name: string;
  /** `virtbase.coverage` from the package's `package.json`; null when absent. */
  thresholds: Thresholds | null;
  /** The parsed `coverage/lcov.info`; null when the package wrote none. */
  report: FileCoverage[] | null;
  /** Estimates for the source files the report does not mention. */
  unloaded: FileCoverage[];
}

/** The gate's verdict on one package. */
export interface PackageResult {
  name: string;
  lines: Counts;
  functions: Counts;
  unloadedFiles: number;
  thresholds: Thresholds | null;
  /** Why the package fails. Empty when it passes or has no thresholds. */
  failures: string[];
}

/**
 * Totals a package's own files, the unloaded ones included, and compares the
 * totals with its thresholds.
 *
 * A package without thresholds is reported and never fails. A package with
 * thresholds fails when:
 *
 * - it wrote no report;
 * - its report holds files from outside the package, which means its
 *   `bunfig.toml` lacks the `../**` ignore and the totals are not its own;
 * - its line or function share is below the threshold.
 */
export const evaluatePackage = ({
  name,
  thresholds,
  report,
  unloaded,
}: PackageInput): PackageResult => {
  const files = [...(report ?? []), ...unloaded];
  const lines = sumCounts(files.map((file) => file.lines));
  const functions = sumCounts(files.map((file) => file.functions));
  const result = {
    name,
    lines,
    functions,
    unloadedFiles: unloaded.length,
    thresholds,
  };

  if (!thresholds) return { ...result, failures: [] };

  const failures: string[] = [];
  if (!report) {
    failures.push("wrote no coverage/lcov.info; run bun run test:coverage");
  }
  const foreign = (report ?? []).filter((file) => file.path.startsWith("../"));
  if (foreign.length > 0) {
    failures.push(
      `its report includes files from other packages, such as ${foreign[0]?.path}; add "../**" to coveragePathIgnorePatterns in its bunfig.toml`,
    );
  }
  if (computeShare(lines) < thresholds.lines) {
    failures.push(
      `lines at ${formatShare(computeShare(lines))}, below ${formatShare(thresholds.lines)}`,
    );
  }
  if (computeShare(functions) < thresholds.functions) {
    failures.push(
      `functions at ${formatShare(computeShare(functions))}, below ${formatShare(thresholds.functions)}`,
    );
  }
  return { ...result, failures };
};

/**
 * The result for a package whose `package.json`, `bunfig.toml` or report
 * could not be read. It always fails, so a damaged input never passes the gate,
 * and `check.ts` still evaluates every other package.
 */
export const unreadablePackage = (
  name: string,
  error: unknown,
): PackageResult => ({
  name,
  lines: { found: 0, hit: 0 },
  functions: { found: 0, hit: 0 },
  unloadedFiles: 0,
  thresholds: null,
  failures: [
    `could not be read: ${error instanceof Error ? error.message : String(error)}`,
  ],
});

/** The share of items that ran, between 0 and 1. Nothing to run counts as 1. */
export const computeShare = ({ found, hit }: Counts): number =>
  found === 0 ? 1 : hit / found;

/**
 * Renders the results as a Markdown table, one row per package, for the CI job
 * summary.
 */
export const formatReport = (results: PackageResult[]): string => {
  const rows = results.map((result) => {
    const verdict =
      result.failures.length > 0
        ? `**fail**: ${result.failures.join("; ")}`
        : result.thresholds
          ? "pass"
          : "no threshold";
    return `| ${result.name} | ${formatCell(result.lines, result.thresholds?.lines)} | ${formatCell(result.functions, result.thresholds?.functions)} | ${result.unloadedFiles} | ${verdict} |`;
  });
  return [
    "## Coverage",
    "",
    "| Package | Lines | Functions | Files no test loads | Result |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
};

const sumCounts = (counts: Counts[]): Counts =>
  counts.reduce(
    (total, count) => ({
      found: total.found + count.found,
      hit: total.hit + count.hit,
    }),
    { found: 0, hit: 0 },
  );

const formatShare = (value: number) => `${(value * 100).toFixed(1)} %`;

const formatCell = (counts: Counts, threshold: number | undefined) => {
  const value = counts.found === 0 ? "–" : formatShare(computeShare(counts));
  return threshold === undefined
    ? value
    : `${value} (min ${formatShare(threshold)})`;
};
