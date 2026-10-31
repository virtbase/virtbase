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
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../../../../..");
const CLIENT_DIRECTIVE =
  /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*["']use client["']/;
const INTEGRATION = /^@virtbase\/integration-[^/]+/;

/**
 * Client modules that imported an integration package outside its `/ui` entry
 * on 2026-10-11, with the imports. Entries never join this list. Each leaves
 * with the fix its risk names: the Anonpay import is risk S9, fixed by the
 * Anonpay migration in Phase 1.
 */
const BEFORE_THE_GATE: Record<string, string[]> = {
  "apps/web/src/features/checkout/components/elements-provider.tsx": [
    "@virtbase/integration-anonpay",
  ],
};

/**
 * The value imports of an integration package outside its `/ui` entry, per
 * client module. Bun's scanner drops `import type`, which never reaches the
 * bundle.
 */
const findClientIntegrationImports = async () => {
  const files = await Array.fromAsync(
    new Bun.Glob("{apps,packages}/*/src/**/*.{ts,tsx}").scan({ cwd: ROOT }),
  );
  const found: Record<string, string[]> = {};
  for (const file of files.sort()) {
    if (file.includes("/__tests__/")) continue;
    const source = await Bun.file(resolve(ROOT, file)).text();
    if (!CLIENT_DIRECTIVE.test(source)) continue;
    const imports = new Bun.Transpiler({
      loader: file.endsWith(".tsx") ? "tsx" : "ts",
    })
      .scan(source)
      .imports.map((entry) => entry.path)
      .filter((path) => INTEGRATION.test(path) && !path.endsWith("/ui"));
    if (imports.length > 0) found[file] = imports;
  }
  return found;
};

describe("client modules", () => {
  test("import an integration package only through its /ui entry", async () => {
    expect(await findClientIntegrationImports()).toEqual(BEFORE_THE_GATE);
  });

  test("the directive check recognises a client module after its licence header", () => {
    expect(CLIENT_DIRECTIVE.test('/*\n * licence\n */\n\n"use client";')).toBe(
      true,
    );
    expect(CLIENT_DIRECTIVE.test('import a from "a";\n"use client";')).toBe(
      false,
    );
  });
});
