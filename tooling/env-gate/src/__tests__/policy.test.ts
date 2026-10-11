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
import {
  BOOTSTRAP,
  evaluateReads,
  isAllowed,
  pruneBaseline,
  SOCIAL_LOGIN,
  TEST_AND_CI,
} from "../policy";

const read = (path: string, variable: string, line = 1) => ({
  path,
  line,
  variable,
});

const inventory = await Bun.file(
  resolve(import.meta.dir, "../../../../docs/architecture/env-inventory.md"),
).text();

const section = (heading: string) => {
  const start = inventory.indexOf(`### ${heading}\n`);
  return inventory.slice(start, inventory.indexOf("\n### ", start + 1));
};

const backticked = (text: string) =>
  [...text.matchAll(/`([A-Z0-9_*]+)`/g)].flatMap((match) => match[1] ?? []);

describe("the allowlist matches env-inventory.md", () => {
  test("BOOTSTRAP is the Bootstrap section", () => {
    expect<string[]>([...BOOTSTRAP].sort()).toEqual(
      backticked(section("Bootstrap")).sort(),
    );
  });

  test("TEST_AND_CI and E2E_ are the Test and CI only section", () => {
    expect<string[]>([...TEST_AND_CI, "E2E_*"].sort()).toEqual(
      backticked(section("Test and CI only")).sort(),
    );
  });

  test("SOCIAL_LOGIN is every variable classified integration (deferred)", () => {
    const deferred = inventory
      .split("\n")
      .filter((line) => line.includes("| integration (deferred) |"))
      .flatMap((line) => backticked(line).slice(0, 1));

    expect<string[]>([...SOCIAL_LOGIN].sort()).toEqual(deferred.sort());
  });
});

describe("isAllowed", () => {
  test("allows a bootstrap variable anywhere", () => {
    expect(isAllowed(read("packages/a/src/x.ts", "DATABASE_URL"))).toBe(true);
  });

  test("allows an E2E_ variable anywhere", () => {
    expect(isAllowed(read("apps/web/e2e/x.ts", "E2E_APP_URL"))).toBe(true);
  });

  test("allows a social-login variable anywhere", () => {
    expect(isAllowed(read("packages/auth/x.ts", "GITHUB_CLIENT_ID"))).toBe(
      true,
    );
  });

  test("refuses a variable on no list", () => {
    expect(isAllowed(read("packages/a/src/x.ts", "STRIPE_SECRET_KEY"))).toBe(
      false,
    );
  });

  test("allows NOVNC_PROXY_SECRET in apps/novnc-proxy only", () => {
    expect(
      isAllowed(read("apps/novnc-proxy/src/index.ts", "NOVNC_PROXY_SECRET")),
    ).toBe(true);
    expect(
      isAllowed(read("packages/api/src/console.ts", "NOVNC_PROXY_SECRET")),
    ).toBe(false);
  });
});

describe("evaluateReads", () => {
  test("permits a read the baseline lists for its file", () => {
    expect(
      evaluateReads({
        reads: [read("src/a.ts", "STRIPE_SECRET_KEY")],
        baseline: { "src/a.ts": ["STRIPE_SECRET_KEY"] },
      }),
    ).toEqual({ added: [], stale: [] });
  });

  test("reports a baseline variable read from another file as added", () => {
    const verdict = evaluateReads({
      reads: [read("src/b.ts", "STRIPE_SECRET_KEY", 7)],
      baseline: { "src/a.ts": ["STRIPE_SECRET_KEY"] },
    });

    expect(verdict.added).toEqual([read("src/b.ts", "STRIPE_SECRET_KEY", 7)]);
  });

  test("reports a baseline entry its file no longer reads as stale", () => {
    expect(
      evaluateReads({
        reads: [],
        baseline: { "src/a.ts": ["STRIPE_SECRET_KEY"] },
      }).stale,
    ).toEqual([{ path: "src/a.ts", variable: "STRIPE_SECRET_KEY" }]);
  });

  test("reports a baseline entry the allowlist now covers as stale", () => {
    expect(
      evaluateReads({
        reads: [read("src/a.ts", "NODE_ENV")],
        baseline: { "src/a.ts": ["NODE_ENV"] },
      }),
    ).toEqual({
      added: [],
      stale: [{ path: "src/a.ts", variable: "NODE_ENV" }],
    });
  });
});

describe("pruneBaseline", () => {
  test("drops stale entries and files left empty", () => {
    expect(
      pruneBaseline({ "src/a.ts": ["X"], "src/b.ts": ["Y"] }, [
        { path: "src/a.ts", variable: "X" },
      ]),
    ).toEqual({ "src/b.ts": ["Y"] });
  });

  test("sorts paths and variables", () => {
    const pruned = pruneBaseline(
      { "src/z.ts": ["B", "A"], "src/a.ts": ["D", "C"] },
      [],
    );

    expect(Object.entries(pruned)).toEqual([
      ["src/a.ts", ["C", "D"]],
      ["src/z.ts", ["A", "B"]],
    ]);
  });
});
