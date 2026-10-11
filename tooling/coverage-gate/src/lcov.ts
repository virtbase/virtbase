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

/** The number of instrumented items in a file, and how many of them ran. */
export interface Counts {
  found: number;
  hit: number;
}

/** Line and function counts for one source file. */
export interface FileCoverage {
  path: string;
  lines: Counts;
  functions: Counts;
}

/**
 * Reads the per-file totals out of an lcov report, as `bun test --coverage`
 * writes it to `coverage/lcov.info`.
 *
 * Only `SF`, `LF`, `LH`, `FNF` and `FNH` are read; a missing count is 0.
 * Throws when a count is not a non-negative integer, because a gate that reads a
 * damaged report as 0 % would fail for the wrong reason.
 */
export const parseLcov = (report: string): FileCoverage[] =>
  report
    .split("end_of_record")
    .map(parseRecord)
    .filter((file) => file !== null);

const parseRecord = (record: string): FileCoverage | null => {
  const fields = new Map<string, string>();
  for (const line of record.split("\n")) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      fields.set(line.slice(0, separator).trim(), line.slice(separator + 1));
    }
  }

  const path = fields.get("SF")?.trim();
  if (!path) return null;

  const count = (key: string) => {
    const value = Number(fields.get(key) ?? "0");
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`lcov record for ${path}: ${key} is not a count`);
    }
    return value;
  };

  return {
    path,
    lines: { found: count("LF"), hit: count("LH") },
    functions: { found: count("FNF"), hit: count("FNH") },
  };
};
