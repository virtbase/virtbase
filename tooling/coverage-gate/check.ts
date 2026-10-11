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

import { relative, resolve } from "node:path";
import type { PackageResult } from "./src/gate";
import { evaluatePackage, formatReport, unreadablePackage } from "./src/gate";
import { listWorkspaceDirectories, loadPackage } from "./src/workspace";

const ROOT = resolve(import.meta.dir, "../..");

const results: PackageResult[] = [];
for (const directory of await listWorkspaceDirectories(ROOT)) {
  try {
    const input = await loadPackage(directory);
    if (input) results.push(evaluatePackage(input));
  } catch (error) {
    results.push(unreadablePackage(relative(ROOT, directory), error));
  }
}

console.log(formatReport(results));

const failed = results.filter((result) => result.failures.length > 0);
for (const result of failed) {
  for (const failure of result.failures) {
    console.error(`coverage: ${result.name} ${failure}`);
  }
}
process.exit(failed.length > 0 ? 1 : 0);
