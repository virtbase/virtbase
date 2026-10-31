/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const command = process.argv[2];

if (!command) {
  console.error("Please provide a command name.");
  process.exit(1);
}

const scriptPath = `./scripts/${command}.ts`;

// Get all arguments after the command (e.g., --truncate)
const scriptArgs = process.argv.slice(3);

const result = Bun.spawnSync(["bun", scriptPath, ...scriptArgs], {
  stdio: ["inherit", "inherit", "inherit"],
  env: {
    ...process.env,
    // Scripts are development tools, and run as `next dev` does unless the
    // caller sets NODE_ENV itself.
    NODE_ENV: process.env.NODE_ENV ?? "development",
  },
});

// `spawnSync` reports the exit through its result; it never calls `onExit`.
// A script that fails must fail `bun script` too, so callers can branch on it.
process.exit(result.exitCode ?? 1);
