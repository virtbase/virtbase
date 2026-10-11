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
import { PATHSPECS, runEnvGate } from "./src/run";

const ROOT = resolve(import.meta.dir, "../..");
const BASELINE = resolve(import.meta.dir, "baseline.json");

const listFiles = (): string[] => {
  const result = Bun.spawnSync(
    [
      "git",
      "-c",
      "core.quotePath=false",
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--deduplicate",
      "--",
      ...PATHSPECS,
    ],
    { cwd: ROOT },
  );
  if (result.exitCode !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout
    .toString()
    .split("\n")
    .filter((path) => path.length > 0);
};

const { reads, added, stale, failures, pruned } = await runEnvGate({
  prune: process.argv.includes("--prune"),
  listFiles,
  readFile: async (path) => {
    const file = Bun.file(resolve(ROOT, path));
    return (await file.exists()) ? file.text() : null;
  },
  readBaseline: () => Bun.file(BASELINE).json(),
  writeBaseline: async (baseline) => {
    await Bun.write(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  },
});

for (const { path, line, variable } of added) {
  console.error(
    `${path}:${line}: reads ${variable}, which neither the bootstrap allowlist (docs/architecture/env-inventory.md) nor tooling/env-gate/baseline.json permits`,
  );
}
for (const { path, variable } of stale) {
  console.error(
    `tooling/env-gate/baseline.json: ${path} no longer reads ${variable}; run bun run env:check --prune`,
  );
}
for (const { path, message } of failures) {
  console.error(`${path}: could not be checked: ${message}`);
}
if (pruned > 0)
  console.log(`env gate: removed ${pruned} stale baseline entries`);
console.log(
  `env gate: ${reads.length} environment reads, ${added.length} not permitted, ${stale.length} stale baseline entries, ${failures.length} files not checked`,
);
if (added.length + stale.length + failures.length > 0) process.exitCode = 1;
