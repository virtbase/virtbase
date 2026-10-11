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

/** The outcome of one `drizzle-kit` command run by `scripts/check-migrations.ts`. */
export type DrizzleKitOutcome =
  | { status: "passed" }
  | { status: "drift"; statements: number }
  | { status: "failed"; reason: string };

/**
 * Reads the outcome of `drizzle-kit check --output json` or
 * `drizzle-kit generate --explain --output json`.
 *
 * `check` passes on `{"status":"ok"}`. `generate` passes on
 * `{"status":"no_changes"}`, and reports drift when it lists statements to
 * generate. Anything else fails, with the output as the reason: a non-zero
 * exit, a last line that is not JSON, or another status.
 */
export const evaluateDrizzleKitRun = ({
  command,
  exitCode,
  stdout,
  stderr,
}: {
  command: "check" | "generate";
  exitCode: number | null;
  stdout: string;
  stderr: string;
}): DrizzleKitOutcome => {
  const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  const failed = { status: "failed", reason: output || "no output" } as const;
  if (exitCode !== 0) return failed;

  const summary = parseSummary(stdout.trim().split("\n").at(-1) ?? "");
  if (command === "check") {
    return summary?.status === "ok" ? { status: "passed" } : failed;
  }
  if (summary?.status === "no_changes") return { status: "passed" };
  if (summary?.status === "ok" && summary.statements > 0) {
    return { status: "drift", statements: summary.statements };
  }
  return failed;
};

const parseSummary = (
  line: string,
): { status: string; statements: number } | null => {
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed !== "object" || parsed === null) return null;
    const status = "status" in parsed ? parsed.status : undefined;
    const statements = "statements" in parsed ? parsed.statements : undefined;
    return typeof status === "string"
      ? {
          status,
          statements: Array.isArray(statements) ? statements.length : 0,
        }
      : null;
  } catch {
    // drizzle-kit printed text instead of its JSON summary, which
    // evaluateDrizzleKitRun reports as a failure.
    return null;
  }
};
