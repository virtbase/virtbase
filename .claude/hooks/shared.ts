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

import { join, resolve } from "node:path";

/** The repository root, two levels above this folder. */
export const PROJECT_ROOT = resolve(join(import.meta.dir, "..", ".."));

/** Files the hooks run Biome on. Biome ignores every other extension. */
export const CHECKED_EXTENSIONS = /\.(ts|tsx|js|mjs|json|jsonc|css)$/;

/** The fields of a Claude Code hook payload that the hooks in this folder read. */
export interface HookInput {
  /** `tool_input.command` of a Bash call, and "" for every other payload. */
  command: string;
  /** `tool_input.file_path` of an Edit or Write call, and "" for every other payload. */
  filePath: string;
  /** `stop_hook_active` of a Stop payload, and false for every other payload. */
  stopHookActive: boolean;
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;

const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    // A payload that is not JSON names no command and no file, so the hooks
    // receive the empty input below and have nothing to check.
    return undefined;
  }
};

/** Reads the hook payload that Claude Code writes to stdin. */
export const readHookInput = async (): Promise<HookInput> => {
  const payload = parse(await Bun.stdin.text());
  const toolInput = field(payload, "tool_input");
  const command = field(toolInput, "command");
  const filePath = field(toolInput, "file_path");

  return {
    command: typeof command === "string" ? command : "",
    filePath: typeof filePath === "string" ? filePath : "",
    stopHookActive: field(payload, "stop_hook_active") === true,
  };
};

/**
 * Runs Biome on `files` from the repository root. Returns 0 when Biome reports
 * nothing; otherwise writes Biome's report to stderr, where Claude Code shows it
 * to Claude, and returns 2.
 */
export const runBiome = (args: string[], files: string[]): 0 | 2 => {
  const result = Bun.spawnSync(
    [
      "bunx",
      "biome",
      "check",
      ...args,
      "--no-errors-on-unmatched",
      "--files-ignore-unknown=true",
      ...files,
    ],
    { cwd: PROJECT_ROOT },
  );
  if (result.exitCode === 0) return 0;

  process.stderr.write(result.stdout);
  process.stderr.write(result.stderr);
  return 2;
};
