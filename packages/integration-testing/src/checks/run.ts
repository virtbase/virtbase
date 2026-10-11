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

import { describe, test } from "bun:test";

/** One check of a suite: a title, and a run that throws when it fails. */
export interface Check<Context> {
  title: string;
  run(context: Context): Promise<void> | void;
}

/**
 * Registers every check as a bun test under `name`; `makeContext` runs before
 * each, so every check starts from a fresh context.
 */
export const describeChecks = <Context>(
  name: string,
  checks: readonly Check<Context>[],
  makeContext: () => Promise<Context>,
): void => {
  describe(name, () => {
    for (const check of checks) {
      test(check.title, async () => check.run(await makeContext()));
    }
  });
};

/**
 * Runs every check against a fresh context and returns one line per failure,
 * the title and the error's message, so a suite's own tests can prove that it
 * fails for a broken implementation.
 */
export const runChecks = async <Context>(
  checks: readonly Check<Context>[],
  makeContext: () => Promise<Context>,
): Promise<string[]> => {
  const failures: string[] = [];
  for (const check of checks) {
    try {
      await check.run(await makeContext());
    } catch (error) {
      failures.push(
        `${check.title}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return failures;
};
