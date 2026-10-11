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

const ROOT = resolve(import.meta.dir, "../../../..");
const SDK_MANIFEST = "packages/integration-sdk/src/manifest.ts";

const ALLOWED_IN_SDK_MANIFEST = [
  "zod",
  "@virtbase/ports",
  "@virtbase/validators",
];
const ALLOWED_IN_INTEGRATION_MANIFEST = [
  ...ALLOWED_IN_SDK_MANIFEST,
  "@virtbase/utils",
  "@virtbase/integration-sdk/manifest",
];

/**
 * Every runtime import of a manifest module outside `allowed`, and every use of
 * the `Bun` global. Bun's scanner drops `import type`, which loads nothing,
 * and its transpiler drops comments.
 */
const findImpureImports = (
  path: string,
  source: string,
  allowed: readonly string[],
): string[] => {
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const imports = transpiler
    .scan(source)
    .imports.map((entry) => entry.path)
    .filter((specifier) => !allowed.includes(specifier))
    .map((specifier) => `${path} imports ${specifier}`);
  const usesBun = /\bBun\./.test(transpiler.transformSync(source))
    ? [`${path} uses the Bun global`]
    : [];
  return [...imports, ...usesBun];
};

describe("manifest modules", () => {
  test("the SDK manifest imports only zod, port types and validators", async () => {
    const source = await Bun.file(resolve(ROOT, SDK_MANIFEST)).text();

    expect(
      findImpureImports(SDK_MANIFEST, source, ALLOWED_IN_SDK_MANIFEST),
    ).toEqual([]);
  });

  test("every integration manifest imports only what an integration manifest may", async () => {
    const paths = await Array.fromAsync(
      new Bun.Glob("packages/integration-*/src/manifest.ts").scan({
        cwd: ROOT,
      }),
    );
    const problems: string[] = [];
    for (const path of paths.filter((entry) => entry !== SDK_MANIFEST)) {
      const source = await Bun.file(resolve(ROOT, path)).text();
      problems.push(
        ...findImpureImports(path, source, ALLOWED_IN_INTEGRATION_MANIFEST),
      );
    }

    expect(problems).toEqual([]);
  });

  test("the check reports a package, a sibling module and the Bun global, and ignores type imports", () => {
    const source = [
      'import type { DnsProvider } from "@virtbase/ports";',
      'import * as z from "zod";',
      'import Stripe from "stripe";',
      'import { client } from "./client";',
      "export const a = [z, Stripe, client, Bun.semver];",
    ].join("\n");

    expect(
      findImpureImports("m.ts", source, ALLOWED_IN_INTEGRATION_MANIFEST),
    ).toEqual([
      "m.ts imports stripe",
      "m.ts imports ./client",
      "m.ts uses the Bun global",
    ]);
  });
});
