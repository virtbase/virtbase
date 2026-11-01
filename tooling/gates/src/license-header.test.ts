import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addHeader,
  agplNotice,
  applyHeaders,
  headerFor,
  leadingHeader,
  licenseOf,
  needsHeader,
} from "./license-header.ts";

const mit = `/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 * SPDX-License-Identifier: MIT
 */
`;

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "license-header-"));
  const write = (path: string, content: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  write("package.json", JSON.stringify({ license: "AGPL-3.0-or-later" }));
  write("apps/web/package.json", JSON.stringify({ name: "web" }));
  write("packages/lib/package.json", JSON.stringify({ license: "MIT" }));
  write("apps/web/src/page.tsx", "export const page = 1;\n");
  write("apps/web/src/page.test.tsx", "export {};\n");
  write("packages/lib/src/index.ts", "export const lib = 1;\n");
  write("packages/lib/src/done.ts", `${mit}\nexport {};\n`);
  return root;
}

describe("headerFor", () => {
  it("states the notice of How to Apply These Terms in LICENSE word for word", () => {
    const license = readFileSync(
      new URL("../../../LICENSE", import.meta.url),
      "utf8",
    );
    const start = license.indexOf("    This program is free software");
    const end = license.indexOf("\n\nAlso add information");
    const words = (text: string) => text.split(/\s+/).filter(Boolean);
    expect(words(agplNotice.join("\n"))).toEqual(
      words(license.slice(start, end)),
    );
  });

  it("renders the AGPL header with the copyright line first", () => {
    const lines = headerFor("AGPL-3.0-or-later", 2026).split("\n");
    expect(lines.slice(0, 4)).toEqual([
      "/*",
      " * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)",
      " *",
      " * This program is free software: you can redistribute it and/or modify",
    ]);
    expect(lines.every((line) => line === line.trimEnd())).toBe(true);
  });

  it("renders the short MIT header", () => {
    expect(headerFor("MIT", 2026)).toBe(mit);
  });

  it("rejects other licences", () => {
    expect(() => headerFor("ISC", 2026)).toThrow("No header for ISC.");
  });
});

describe("needsHeader", () => {
  it.each([
    "apps/web/src/app/page.tsx",
    "packages/ui/src/styles.css",
    "tooling/vitest/src/index.ts",
    "scripts/run.mjs",
    "src/legacy.js",
  ])("selects the source file %s", (path) => {
    expect(needsHeader(path)).toBe(true);
  });

  it.each([
    "apps/web/next-env.d.ts",
    "apps/web/src/app/page.test.tsx",
    "apps/web/e2e/site.spec.ts",
    "apps/web/e2e/fixtures.ts",
    "apps/web/next.config.ts",
    "apps/web/postcss.config.mjs",
    "packages/api/vitest.config.ts",
    "packages/foundation/dist/index.js",
    "apps/web/.next/server/app.js",
    "package.json",
    "README.md",
  ])("skips %s", (path) => {
    expect(needsHeader(path)).toBe(false);
  });
});

describe("addHeader", () => {
  it("prepends the header and one blank line", () => {
    expect(addHeader("\n\nexport {};\n", mit)).toBe(`${mit}\nexport {};\n`);
  });

  it("keeps a shebang on the first line", () => {
    expect(addHeader("#!/usr/bin/env bun\nrun();\n", mit)).toBe(
      `#!/usr/bin/env bun\n${mit}\nrun();\n`,
    );
  });

  it("writes only the header into an empty file", () => {
    expect(addHeader("", mit)).toBe(mit);
  });

  it("leaves a file with a copyright header unchanged", () => {
    const content = `${mit}\nexport {};\n`;
    expect(addHeader(content, headerFor("AGPL-3.0-or-later", 2027))).toBe(
      content,
    );
    expect(leadingHeader(content)).toBe(mit);
  });

  it("does not count other leading comments as a header", () => {
    expect(leadingHeader("/* eslint */\nexport {};\n")).toBeUndefined();
    expect(leadingHeader("export {};\n")).toBeUndefined();
  });
});

describe("licenseOf", () => {
  it("uses the nearest package.json that declares a licence", () => {
    const root = workspace();
    expect(licenseOf(join(root, "apps/web/src/page.tsx"), root)).toBe(
      "AGPL-3.0-or-later",
    );
    expect(licenseOf(join(root, "packages/lib/src/index.ts"), root)).toBe(
      "MIT",
    );
  });

  it("fails without a licence up to the root", () => {
    const root = mkdtempSync(join(tmpdir(), "license-header-"));
    expect(() => licenseOf(join(root, "src/index.ts"), root)).toThrow(
      "No package.json with a license",
    );
  });
});

describe("applyHeaders", () => {
  it("adds the matching header to source files that lack one", () => {
    const root = workspace();
    const changed = applyHeaders(
      [
        join(root, "apps/web/src/page.tsx"),
        "apps/web/src/page.test.tsx",
        "packages/lib/src/index.ts",
        "packages/lib/src/done.ts",
        "packages/lib/src/deleted.ts",
        "package.json",
      ],
      root,
      2026,
    );
    expect(changed).toEqual([
      "apps/web/src/page.tsx",
      "packages/lib/src/index.ts",
    ]);
    const read = (path: string) => readFileSync(join(root, path), "utf8");
    expect(read("apps/web/src/page.tsx")).toBe(
      `${headerFor("AGPL-3.0-or-later", 2026)}\nexport const page = 1;\n`,
    );
    expect(read("packages/lib/src/index.ts")).toBe(
      `${mit}\nexport const lib = 1;\n`,
    );
    expect(read("apps/web/src/page.test.tsx")).toBe("export {};\n");
    expect(applyHeaders(changed, root, 2027)).toEqual([]);
  });
});
