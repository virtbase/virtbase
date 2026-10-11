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

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listWorkspaceDirectories,
  loadPackage,
  selectUnloadedSources,
} from "../workspace";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "coverage-gate-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const write = (path: string, content: string) =>
  Bun.write(join(root, path), content);

describe("listWorkspaceDirectories", () => {
  test("expands the workspace globs, sorted", async () => {
    await write(
      "package.json",
      JSON.stringify({ workspaces: ["packages/*", "tooling/gate"] }),
    );
    await write("packages/b/package.json", "{}");
    await write("packages/a/package.json", "{}");
    await write("tooling/gate/package.json", "{}");
    await write("tooling/other/package.json", "{}");

    expect(await listWorkspaceDirectories(root)).toEqual([
      join(root, "packages/a"),
      join(root, "packages/b"),
      join(root, "tooling/gate"),
    ]);
  });
});

describe("selectUnloadedSources", () => {
  test("keeps the source files the report misses, sorted", () => {
    expect(
      selectUnloadedSources({
        sources: ["src/c.ts", "src/a.ts", "src/b.tsx"],
        reported: ["src/a.ts"],
        ignorePatterns: [],
      }),
    ).toEqual(["src/b.tsx", "src/c.ts"]);
  });

  test("never counts declarations, tests or ignored paths", () => {
    expect(
      selectUnloadedSources({
        sources: [
          "src/types.d.ts",
          "src/__tests__/a.test.ts",
          "src/b.test.tsx",
          "src/testing/fixtures.ts",
          "src/kept.ts",
        ],
        reported: [],
        ignorePatterns: ["../**", "src/testing/**"],
      }),
    ).toEqual(["src/kept.ts"]);
  });
});

describe("loadPackage", () => {
  test("reads thresholds, the report and the files the report misses", async () => {
    await write(
      "package.json",
      JSON.stringify({
        name: "@virtbase/a",
        virtbase: { coverage: { lines: 0.9, functions: 0.8 } },
      }),
    );
    await write(
      "bunfig.toml",
      '[test]\ncoveragePathIgnorePatterns = ["../**", "src/testing/**"]\n',
    );
    await write(
      "coverage/lcov.info",
      "SF:src/loaded.ts\nLF:3\nLH:3\nend_of_record\n",
    );
    await write("src/loaded.ts", "export const a = () => 1;\n");
    await write("src/unloaded.ts", "export const b = () => 2;\n");
    await write("src/testing/fixtures.ts", "export const c = () => 3;\n");
    await write("src/__tests__/a.test.ts", "export const d = () => 4;\n");
    await write("src/types.d.ts", "declare const e: number;\n");

    const input = await loadPackage(root);

    expect(input?.name).toBe("@virtbase/a");
    expect(input?.thresholds).toEqual({ lines: 0.9, functions: 0.8 });
    expect(input?.report).toEqual([
      {
        path: "src/loaded.ts",
        lines: { found: 3, hit: 3 },
        functions: { found: 0, hit: 0 },
      },
    ]);
    expect(input?.unloaded.map((file) => file.path)).toEqual([
      "src/unloaded.ts",
    ]);
  });

  test("reads a package without thresholds, bunfig or report", async () => {
    await write("package.json", JSON.stringify({ name: "@virtbase/a" }));
    await write("src/index.ts", "export const a = () => 1;\n");

    const input = await loadPackage(root);

    expect(input?.thresholds).toBeNull();
    expect(input?.report).toBeNull();
    expect(input?.unloaded).toHaveLength(1);
  });

  test("skips a package with neither source files nor a report", async () => {
    await write("package.json", JSON.stringify({ name: "@virtbase/content" }));

    expect(await loadPackage(root)).toBeNull();
  });

  test("rejects a threshold outside 0 to 1", async () => {
    await write(
      "package.json",
      JSON.stringify({
        name: "@virtbase/a",
        virtbase: { coverage: { lines: 90, functions: 0.8 } },
      }),
    );

    await expect(loadPackage(root)).rejects.toThrow();
  });
});
