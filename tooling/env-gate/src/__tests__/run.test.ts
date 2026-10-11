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
import type { Baseline } from "../policy";
import { runEnvGate } from "../run";

const FILES: Record<string, string> = {
  "src/stripe.ts": "export const key = process.env.STRIPE_SECRET_KEY;",
  "src/plain.ts": "export const a = 1;",
  "src/broken.ts": "const env = = ;",
};

const run = async ({
  baseline,
  prune = false,
  files = Object.keys(FILES),
}: {
  baseline: unknown;
  prune?: boolean;
  files?: string[];
}) => {
  const written: Baseline[] = [];
  const result = await runEnvGate({
    prune,
    listFiles: () => files,
    readFile: async (path) => FILES[path] ?? null,
    readBaseline: async () => baseline,
    writeBaseline: async (next) => {
      written.push(next);
    },
  });
  return { result, written };
};

describe("runEnvGate", () => {
  test("permits the baseline's reads and skips files that are gone", async () => {
    const { result } = await run({
      baseline: { "src/stripe.ts": ["STRIPE_SECRET_KEY"] },
      files: ["src/stripe.ts", "src/plain.ts", "src/deleted.ts"],
    });

    expect(result.reads.map((read) => read.variable)).toEqual([
      "STRIPE_SECRET_KEY",
    ]);
    expect(result.added).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  test("reports a read the baseline does not list", async () => {
    const { result } = await run({ baseline: {}, files: ["src/stripe.ts"] });

    expect(result.added.map((read) => read.variable)).toEqual([
      "STRIPE_SECRET_KEY",
    ]);
  });

  test("records a file it cannot parse as not checked", async () => {
    const { result } = await run({ baseline: {}, files: ["src/broken.ts"] });

    expect(result.failures.map((failure) => failure.path)).toEqual([
      "src/broken.ts",
    ]);
  });

  test("reports stale entries, and writes nothing without prune", async () => {
    const { result, written } = await run({
      baseline: {
        "src/gone.ts": ["SMTP_HOST"],
        "src/stripe.ts": ["STRIPE_SECRET_KEY"],
      },
      files: ["src/stripe.ts"],
    });

    expect(result.stale).toEqual([
      { path: "src/gone.ts", variable: "SMTP_HOST" },
    ]);
    expect(written).toEqual([]);
  });

  test("with prune, writes the baseline without its stale entries", async () => {
    const { result, written } = await run({
      prune: true,
      baseline: {
        "src/gone.ts": ["SMTP_HOST"],
        "src/stripe.ts": ["STRIPE_SECRET_KEY"],
      },
      files: ["src/stripe.ts"],
    });

    expect(written).toEqual([{ "src/stripe.ts": ["STRIPE_SECRET_KEY"] }]);
    expect(result.pruned).toBe(1);
    expect(result.stale).toEqual([]);
  });

  test("rejects a baseline that is not a map of paths to variables", async () => {
    await expect(run({ baseline: { "src/a.ts": "X" } })).rejects.toThrow();
  });
});
