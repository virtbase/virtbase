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
import { relative, resolve, sep } from "node:path";
import { MESSAGE_SOURCE_PATHS } from "../source-paths";

const WEB = resolve(import.meta.dir, "../../..");
const ROOT = resolve(WEB, "../..");
const CALL = /\b(?:useExtracted|getExtracted)\s*\(/;

/**
 * Every source file under `apps/*\/src` and `packages/*\/src` that calls
 * `useExtracted` or `getExtracted`, tests left out. Bun's transpiler drops
 * comments, so a comment that names either function is not a call.
 */
const findCallers = async (): Promise<string[]> => {
  const files = await Array.fromAsync(
    new Bun.Glob("{apps,packages}/*/src/**/*.{ts,tsx}").scan({ cwd: ROOT }),
  );
  const callers: string[] = [];
  for (const file of files) {
    if (file.includes(`${sep}__tests__${sep}`) || /\.test\.tsx?$/.test(file)) {
      continue;
    }
    const source = await Bun.file(resolve(ROOT, file)).text();
    if (!source.includes("Extracted")) continue;
    const code = new Bun.Transpiler({
      loader: file.endsWith(".tsx") ? "tsx" : "ts",
    }).transformSync(source);
    if (CALL.test(code)) callers.push(file);
  }
  return callers.sort();
};

const isUnder = (file: string, directory: string) =>
  !relative(resolve(WEB, directory), resolve(ROOT, file)).startsWith("..");

describe("MESSAGE_SOURCE_PATHS", () => {
  test("covers every file that calls useExtracted or getExtracted", async () => {
    const uncovered = (await findCallers()).filter(
      (file) =>
        !MESSAGE_SOURCE_PATHS.some((directory) => isUnder(file, directory)),
    );

    expect(uncovered).toEqual([]);
  });

  test("lists only directories that exist and hold a call", async () => {
    const callers = await findCallers();
    const stale = MESSAGE_SOURCE_PATHS.filter(
      (directory) => !callers.some((file) => isUnder(file, directory)),
    );

    expect(stale).toEqual([]);
  });
});
