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

import {
  CHECKED_EXTENSIONS,
  PROJECT_ROOT,
  readHookInput,
  runBiome,
} from "./shared";

/**
 * Claude Code `Stop` hook. Before Claude ends its turn, it runs:
 *
 * - Biome over every changed and untracked file;
 * - the comment gate over every comment line added since the branch left
 *   `origin/main`.
 *
 * It keeps Claude working while either reports a problem.
 *
 * Claude Code sets `stop_hook_active` when Claude is already continuing because
 * of this hook. The hook then lets Claude stop, so a problem Claude cannot fix
 * costs one extra round instead of an endless loop.
 */

/** Paths, relative to the repository root, that one git command prints. */
const gitPaths = (...args: string[]): string[] =>
  Bun.spawnSync(["git", ...args], { cwd: PROJECT_ROOT })
    .stdout.toString()
    .split("\n")
    .filter((path) => path.length > 0);

/**
 * Runs `tooling/comment-gate/check.ts` against `origin/main`, with its
 * findings on stderr. Returns 2, which blocks, when the gate reports a
 * violation (exit code 1). Returns 0 when it passes, and when it could not run
 * (exit code 2), such as without an `origin/main`: a broken setup is not a
 * comment Claude can fix.
 */
const checkComments = (): number =>
  Bun.spawnSync(["bun", "tooling/comment-gate/check.ts", "origin/main"], {
    cwd: PROJECT_ROOT,
    stdout: "ignore",
    stderr: "inherit",
  }).exitCode === 1
    ? 2
    : 0;

const { stopHookActive } = await readHookInput();

if (!stopHookActive) {
  const changed = [
    ...gitPaths("diff", "--name-only", "--diff-filter=ACMR", "HEAD"),
    ...gitPaths("ls-files", "--others", "--exclude-standard"),
  ].filter((path) => CHECKED_EXTENSIONS.test(path));

  const biome = changed.length > 0 ? runBiome([], changed) : 0;
  process.exit(Math.max(biome, checkComments()));
}
