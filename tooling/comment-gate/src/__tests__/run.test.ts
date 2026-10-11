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
import { runCommentGate } from "../run";

const DIFF = [
  "diff --git a/src/changed.ts b/src/changed.ts",
  "--- a/src/changed.ts",
  "+++ b/src/changed.ts",
  "@@ -1,0 +2 @@",
  "+// This might fail.",
].join("\n");

const fakeGit =
  ({ untracked = "", failMergeBase = false } = {}) =>
  (args: string[]): string => {
    if (args[0] === "merge-base") {
      if (failMergeBase) throw new Error("git merge-base failed");
      expect(args).toEqual(["merge-base", "origin/main", "HEAD"]);
      return "abc123\n";
    }
    if (args.includes("diff")) {
      expect(args).toContain("abc123");
      expect(args).toContain("--dst-prefix=b/");
      return DIFF;
    }
    return untracked;
  };

const FILES: Record<string, string> = {
  "src/changed.ts": "// This might fail.\n// This might fail.\n",
  "src/new.ts": "// TODO: later\nexport const a = 1;\n",
  "src/broken.ts": "const = = ;",
};

const readFile = async (path: string) => {
  const source = FILES[path];
  if (source === undefined) throw new Error(`ENOENT: ${path}`);
  return source;
};

describe("runCommentGate", () => {
  test("checks the lines the diff adds, and every line of an untracked file", async () => {
    const result = await runCommentGate({
      base: "origin/main",
      runGit: fakeGit({ untracked: "src/new.ts\n" }),
      readFile,
    });

    expect(
      result.violations.map(({ path, line, rule }) => [path, line, rule]),
    ).toEqual([
      ["src/changed.ts", 2, "CMT-8"],
      ["src/new.ts", 1, "CMT-10"],
    ]);
    expect(result.failures).toEqual([]);
    expect(result.checked).toBe(2);
  });

  test("records a file it cannot read or parse as not checked", async () => {
    const result = await runCommentGate({
      base: "origin/main",
      runGit: fakeGit({ untracked: "src/broken.ts\nsrc/missing.ts\n" }),
      readFile,
    });

    expect(result.failures.map((failure) => failure.path)).toEqual([
      "src/broken.ts",
      "src/missing.ts",
    ]);
  });

  test("throws when git cannot find the base", async () => {
    await expect(
      runCommentGate({
        base: "origin/main",
        runGit: fakeGit({ failMergeBase: true }),
        readFile,
      }),
    ).rejects.toThrow("git merge-base failed");
  });
});
