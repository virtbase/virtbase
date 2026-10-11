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

/**
 * Reads the line numbers each file gains or changes from a unified diff, as
 * `git diff --unified=0 --src-prefix=a/ --dst-prefix=b/` prints it.
 *
 * A changed line is a removal and an addition, so it is counted as added. Line
 * numbers refer to the new version of the file. A deleted file has no entry. A
 * `+++ ` line is a file header only between `diff --git` and the first hunk,
 * so an added line that starts with `++` is never read as one. Git ends a
 * header path that holds a space with a tab, which is removed.
 */
export const parseAddedLines = (diff: string): Map<string, Set<number>> => {
  const added = new Map<string, Set<number>>();
  let lines: Set<number> | null = null;
  let inHeader = false;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      inHeader = true;
      lines = null;
      continue;
    }
    if (inHeader && line.startsWith("+++ ")) {
      const target = line.slice(4).replace(/\t$/, "");
      lines = target === "/dev/null" ? null : new Set();
      if (lines) added.set(target.replace(/^b\//, ""), lines);
      continue;
    }
    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      inHeader = false;
      if (!lines) continue;
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let offset = 0; offset < count; offset++) lines.add(start + offset);
    }
  }
  return added;
};

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
