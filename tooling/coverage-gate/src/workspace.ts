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

import { dirname, join } from "node:path";
import * as z from "zod";
import { estimateUnloadedFile } from "./estimate";
import type { PackageInput } from "./gate";
import type { FileCoverage } from "./lcov";
import { parseLcov } from "./lcov";

const RootManifestSchema = z.object({ workspaces: z.array(z.string()) });

const ShareSchema = z.number().min(0).max(1);

const PackageManifestSchema = z.object({
  name: z.string(),
  virtbase: z
    .object({
      coverage: z.object({ lines: ShareSchema, functions: ShareSchema }),
    })
    .optional(),
});

const BunfigSchema = z.object({
  test: z
    .object({ coveragePathIgnorePatterns: z.array(z.string()).optional() })
    .optional(),
});

const SOURCE_FILES = new Bun.Glob("src/**/*.{ts,tsx}");

const NEVER_COUNTED = ["**/*.d.ts", "**/__tests__/**", "**/*.test.{ts,tsx}"];

/**
 * Lists the directory of every workspace package named by the `workspaces`
 * globs in `root`'s `package.json`, sorted.
 */
export const listWorkspaceDirectories = async (
  root: string,
): Promise<string[]> => {
  const { workspaces } = RootManifestSchema.parse(
    await Bun.file(join(root, "package.json")).json(),
  );
  const directories: string[] = [];
  for (const pattern of workspaces) {
    const manifests = new Bun.Glob(`${pattern}/package.json`);
    for await (const manifest of manifests.scan({ cwd: root })) {
      directories.push(join(root, dirname(manifest)));
    }
  }
  return directories.sort();
};

/**
 * Reads the thresholds, the coverage report and the unloaded source files of
 * the package in `directory`.
 *
 * Source files are the `.ts` and `.tsx` files under `src`, as filtered by
 * {@link selectUnloadedSources}. Returns null for a package with neither a
 * report nor a countable source file, such as `packages/content`.
 */
export const loadPackage = async (
  directory: string,
): Promise<PackageInput | null> => {
  const manifest = PackageManifestSchema.parse(
    await Bun.file(join(directory, "package.json")).json(),
  );
  const report = await readReport(directory);
  const sources = await Array.fromAsync(SOURCE_FILES.scan({ cwd: directory }));
  const unloadedPaths = selectUnloadedSources({
    sources,
    reported: report?.map((file) => file.path) ?? [],
    ignorePatterns: await readIgnorePatterns(directory),
  });

  if (!report && unloadedPaths.length === 0) return null;

  const unloaded: FileCoverage[] = [];
  for (const path of unloadedPaths) {
    const source = await Bun.file(join(directory, path)).text();
    unloaded.push(estimateUnloadedFile(path, source));
  }

  return {
    name: manifest.name,
    thresholds: manifest.virtbase?.coverage ?? null,
    report,
    unloaded,
  };
};

/**
 * Picks the source files a coverage report does not mention.
 *
 * Declaration files, tests and every path matching `ignorePatterns` (the
 * package's `coveragePathIgnorePatterns`) are never counted.
 */
export const selectUnloadedSources = ({
  sources,
  reported,
  ignorePatterns,
}: {
  sources: string[];
  reported: string[];
  ignorePatterns: string[];
}): string[] => {
  const ignored = [...NEVER_COUNTED, ...ignorePatterns].map(
    (pattern) => new Bun.Glob(pattern),
  );
  const mentioned = new Set(reported);
  return sources
    .filter((path) => !mentioned.has(path))
    .filter((path) => !ignored.some((glob) => glob.match(path)))
    .sort();
};

const readReport = async (directory: string) => {
  const file = Bun.file(join(directory, "coverage", "lcov.info"));
  return (await file.exists()) ? parseLcov(await file.text()) : null;
};

const readIgnorePatterns = async (directory: string) => {
  const file = Bun.file(join(directory, "bunfig.toml"));
  if (!(await file.exists())) return [];
  const bunfig = BunfigSchema.parse(Bun.TOML.parse(await file.text()));
  return bunfig.test?.coveragePathIgnorePatterns ?? [];
};
