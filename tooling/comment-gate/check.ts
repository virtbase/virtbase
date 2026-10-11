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

import { resolve } from "node:path";
import { runCommentGate } from "./src/run";

const ROOT = resolve(import.meta.dir, "../..");

const runGit = (args: string[]): string => {
  const result = Bun.spawnSync(["git", ...args], { cwd: ROOT });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr.toString().trim()}`,
    );
  }
  return result.stdout.toString();
};

// Exit code 1 means a violation and 2 means the gate could not check
// everything. `.claude/hooks/stop-check.ts` blocks on 1 only.
try {
  const { violations, failures, checked } = await runCommentGate({
    base: process.argv[2] ?? "origin/main",
    runGit,
    readFile: (path) => Bun.file(resolve(ROOT, path)).text(),
  });
  for (const { path, line, rule, message } of violations) {
    console.error(`${path}:${line}: ${rule} ${message}`);
  }
  for (const { path, message } of failures) {
    console.error(`${path}: could not be checked: ${message}`);
  }
  console.log(
    `comment gate: ${violations.length} violations in ${checked} changed files, ${failures.length} files not checked`,
  );
  process.exitCode = violations.length > 0 ? 1 : failures.length > 0 ? 2 : 0;
} catch (error) {
  console.error(
    `comment gate could not run: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
}
