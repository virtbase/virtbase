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
import { evaluateDrizzleKitRun } from "../drizzle-kit";

const run = (
  command: "check" | "generate",
  stdout: string,
  exitCode = 0,
  stderr = "",
) => evaluateDrizzleKitRun({ command, exitCode, stdout, stderr });

describe("evaluateDrizzleKitRun", () => {
  test("passes check on ok, and generate on no_changes", () => {
    expect(run("check", '{"status":"ok","dialect":"postgresql"}')).toEqual({
      status: "passed",
    });
    expect(run("generate", 'Reading config\n{"status":"no_changes"}')).toEqual({
      status: "passed",
    });
  });

  test("reports drift when generate lists statements", () => {
    expect(
      run(
        "generate",
        '{"status":"ok","statements":[{"type":"add_column"},{"type":"drop_index"}]}',
      ),
    ).toEqual({ status: "drift", statements: 2 });
  });

  test("fails a non-zero exit with its output", () => {
    expect(run("check", "", 1, "Error: conflict")).toEqual({
      status: "failed",
      reason: "Error: conflict",
    });
  });

  test("fails a summary that is not JSON, and another status", () => {
    expect(run("check", "All good").status).toBe("failed");
    expect(run("check", '{"status":"check_error"}').status).toBe("failed");
    expect(run("generate", '{"status":"ok","statements":[]}').status).toBe(
      "failed",
    );
    expect(run("generate", "[1,2]").status).toBe("failed");
  });

  test("fails without any output", () => {
    expect(run("check", "", 1)).toEqual({
      status: "failed",
      reason: "no output",
    });
  });
});
