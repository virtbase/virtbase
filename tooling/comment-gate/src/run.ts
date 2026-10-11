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

import { extractCommentLines } from "./comments";
import { parseAddedLines } from "./diff";
import type { Violation } from "./rules";
import { findViolations } from "./rules";

/** What the gate needs from the outside world. */
export interface GateDependencies {
  /** Runs git in the repository root; throws when git exits non-zero. */
  runGit: (args: string[]) => string;
  /** Reads a file by its path relative to the repository root. */
  readFile: (path: string) => Promise<string>;
}

/** The outcome of one run. */
export interface GateResult {
  violations: Violation[];
  /** Files the gate could not read or parse, so it checked none of their lines. */
  failures: { path: string; message: string }[];
  /** How many changed files the gate looked at. */
  checked: number;
}

/** The files the gate reads, as git pathspecs. */
export const PATHSPECS = ["*.ts", "*.tsx", "*.js", "*.mjs"];

const DIFF_OPTIONS = [
  "-c",
  "core.quotePath=false",
  "diff",
  "--unified=0",
  "--no-color",
  "--no-ext-diff",
  "--src-prefix=a/",
  "--dst-prefix=b/",
  "--diff-filter=AMR",
];

/**
 * Checks every comment line added since the merge base of `base` and `HEAD`.
 *
 * The working tree is compared with the merge base, so uncommitted changes
 * count, and untracked files count as entirely added. The diff options fix the
 * path prefixes and turn off path quoting, so a user's git configuration cannot
 * change the paths the gate reads. Throws when git fails, for example when
 * `base` does not exist.
 */
export const runCommentGate = async ({
  base,
  runGit,
  readFile,
}: GateDependencies & { base: string }): Promise<GateResult> => {
  const mergeBase = runGit(["merge-base", base, "HEAD"]).trim();
  const added = parseAddedLines(
    runGit([...DIFF_OPTIONS, mergeBase, "--", ...PATHSPECS]),
  );
  const untracked = runGit([
    "-c",
    "core.quotePath=false",
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...PATHSPECS,
  ])
    .split("\n")
    .filter((path) => path.length > 0);

  const violations: Violation[] = [];
  const failures: GateResult["failures"] = [];
  for (const path of [...added.keys(), ...untracked]) {
    try {
      const source = await readFile(path);
      const lines =
        added.get(path) ??
        new Set(source.split("\n").map((_, index) => index + 1));
      const comments = extractCommentLines(path, source);
      violations.push(...findViolations({ path, comments, added: lines }));
    } catch (error) {
      failures.push({
        path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { violations, failures, checked: added.size + untracked.length };
};
