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

// Fails unless the committed migrations agree with the schema: `drizzle-kit
// check` finds the migration snapshots consistent, and `drizzle-kit generate
// --explain` has nothing left to generate. src/migration-gate/drizzle-kit.ts
// reads each command's outcome.

import { resolve } from "node:path";
import { evaluateDrizzleKitRun } from "../src/migration-gate/drizzle-kit";

/**
 * Neither command connects to a database, but `drizzle.config.ts` requires a
 * `DATABASE_URL`. The commands get this placeholder and `PATH` instead of the
 * caller's environment, so a developer's real URL is never handed to them.
 */
const PLACEHOLDER_DATABASE_URL =
  "postgres://migration-gate@localhost:5432/migration-gate";

const COMMANDS = {
  check: ["check", "--output", "json"],
  generate: ["generate", "--explain", "--output", "json"],
} as const;

let failed = false;
for (const command of ["check", "generate"] as const) {
  const args = COMMANDS[command];
  const result = Bun.spawnSync(["bun", "--bun", "x", "drizzle-kit", ...args], {
    cwd: resolve(import.meta.dir, ".."),
    env: { PATH: Bun.env.PATH ?? "", DATABASE_URL: PLACEHOLDER_DATABASE_URL },
  });
  const outcome = evaluateDrizzleKitRun({
    command,
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  });
  if (outcome.status === "passed") {
    console.log(`drizzle-kit ${command}: passed`);
    continue;
  }
  failed = true;
  if (outcome.status === "drift") {
    console.error(
      `drizzle-kit generate: the schema has ${outcome.statements} changes no migration holds. Run bun run db:generate and commit the folder it writes (DB-11).`,
    );
  } else {
    console.error(`drizzle-kit ${command} failed:\n${outcome.reason}`);
  }
}
if (failed) process.exitCode = 1;
