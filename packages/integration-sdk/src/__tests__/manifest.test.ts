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
import * as z from "zod";
import { defineManifest, IntegrationManifestSchema } from "../manifest";
import { acmeManifest } from "./acme";

describe("IntegrationManifestSchema", () => {
  test("accepts a complete manifest", () => {
    expect(IntegrationManifestSchema.safeParse(acmeManifest).success).toBe(
      true,
    );
  });

  test.each([
    ["an id that is not a slug", { id: "Acme DNS" }],
    ["a version that is not major.minor.patch", { version: "1.0" }],
    ["another apiVersion", { apiVersion: 1 }],
    ["another docs path", { docs: "./documentation" }],
    ["an http timeout above 30 s", { http: { timeoutMs: 60_000 } }],
    ["an unknown category", { category: "games" }],
    ["a key the manifest does not have", { multiInstance: true }],
  ])("rejects %s", (_, change) => {
    expect(
      IntegrationManifestSchema.safeParse({ ...acmeManifest, ...change })
        .success,
    ).toBe(false);
  });
});

describe("defineManifest", () => {
  test("returns the manifest unchanged", () => {
    const manifest = { ...acmeManifest, id: "copy" };

    expect(defineManifest(manifest)).toBe(manifest);
  });

  test("rejects a field key its schema does not declare, at compile time", () => {
    defineManifest({
      ...acmeManifest,
      settings: {
        schema: z.object({ zone: z.string() }),
        // @ts-expect-error: the schema declares zone, not nope
        fields: [{ key: "nope", label: "Nope", widget: "text" }],
      },
    });
    expect(true).toBe(true);
  });
});
