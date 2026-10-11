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

import type { Baseline, Verdict } from "./policy";
import { BaselineSchema, evaluateReads, pruneBaseline } from "./policy";
import type { EnvRead } from "./reads";
import { findEnvReads } from "./reads";

/** The source files the gate reads, as git pathspecs. */
export const PATHSPECS = [
  "*.ts",
  "*.tsx",
  "*.mts",
  "*.cts",
  "*.js",
  "*.jsx",
  "*.mjs",
  "*.cjs",
];

const MENTIONS_ENV = /\benv\b/;

/** What the gate needs from the outside world. */
export interface EnvGateDependencies {
  /** Lists the tracked and untracked source files, relative to the root. */
  listFiles: () => string[];
  /** Reads a file by its path relative to the root; null when it is gone. */
  readFile: (path: string) => Promise<string | null>;
  readBaseline: () => Promise<unknown>;
  writeBaseline: (baseline: Baseline) => Promise<void>;
}

/** The outcome of one run. */
export interface EnvGateResult extends Verdict {
  reads: EnvRead[];
  /** Files the gate could not parse, so it saw none of their reads. */
  failures: { path: string; message: string }[];
  /** How many stale entries `prune` removed from the baseline. */
  pruned: number;
}

/**
 * Finds every environment read and compares the reads with the allowlist and
 * the baseline. With `prune`, it writes the baseline back without its stale
 * entries, and reports none as stale.
 */
export const runEnvGate = async ({
  prune,
  listFiles,
  readFile,
  readBaseline,
  writeBaseline,
}: EnvGateDependencies & { prune: boolean }): Promise<EnvGateResult> => {
  const reads: EnvRead[] = [];
  const failures: EnvGateResult["failures"] = [];
  for (const path of listFiles()) {
    try {
      const source = await readFile(path);
      if (source !== null && MENTIONS_ENV.test(source)) {
        reads.push(...findEnvReads(path, source));
      }
    } catch (error) {
      failures.push({
        path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const baseline = BaselineSchema.parse(await readBaseline());
  const { added, stale } = evaluateReads({ reads, baseline });
  if (!prune) return { reads, added, stale, failures, pruned: 0 };

  await writeBaseline(pruneBaseline(baseline, stale));
  return { reads, added, stale: [], failures, pruned: stale.length };
};
