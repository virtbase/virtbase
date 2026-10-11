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
import {
  findCompositionProblems,
  IntegrationCompositionError,
  isSdkApiSupported,
} from "../compose";
import { defineIntegration } from "../define-integration";
import type { IntegrationManifest } from "../manifest";
import { IntegrationRegistry } from "../registry";
import { acmeConfig, acmeManifest, fakeDns, silentLogger } from "./acme";

const acme = defineIntegration(acmeManifest, {
  provides: { dns: () => fakeDns },
  localize: async () => ({}),
});

/** A v1 definition carrying a manifest with problems the types cannot see. */
const broken = (manifest: Partial<IntegrationManifest>) =>
  defineIntegration({
    id: "broken",
    name: "Broken",
    description: "Carries a manifest the types cannot check.",
    category: "platform",
    provides: { dns: () => fakeDns },
    manifest: { ...acmeManifest, id: "broken", ...manifest },
  });

describe("isSdkApiSupported", () => {
  test.each([
    ["^2.0.0", true],
    [">=2.0.0 <3.0.0", true],
    ["^3.0.0", false],
    [undefined, true],
  ])("requires.apiVersion %p gives %p", (range, supported) => {
    expect(
      isSdkApiSupported({
        ...acmeManifest,
        requires: range === undefined ? undefined : { apiVersion: range },
      }),
    ).toBe(supported);
  });
});

describe("findCompositionProblems", () => {
  test("accepts integrations it can compose", () => {
    expect(findCompositionProblems([acme])).toEqual([]);
  });

  test("reports a duplicate id", () => {
    expect(findCompositionProblems([acme, acme])).toEqual([
      "acme-dns: listed twice",
    ]);
  });

  test("reports a manifest that does not parse", () => {
    expect(findCompositionProblems([broken({ id: "Broken ID" })])).toEqual([
      "broken: manifest id must be a lowercase slug",
    ]);
  });

  test("reports an SDK version the manifest does not support", () => {
    expect(
      findCompositionProblems([broken({ requires: { apiVersion: "^3.0.0" } })]),
    ).toEqual(["broken: requires SDK ^3.0.0, this is 2.0.0"]);
  });

  test("reports ports the manifest lists but the runtime does not implement", () => {
    expect(
      findCompositionProblems([broken({ provides: ["dns", "invoice"] })]),
    ).toEqual([
      "broken: manifest provides [dns, invoice] but the runtime implements [dns]",
    ]);
  });
});

describe("the registry", () => {
  test("refuses a composition with problems", () => {
    expect(
      () =>
        new IntegrationRegistry({
          integrations: [acme, acme],
          config: acmeConfig,
          logger: silentLogger,
        }),
    ).toThrow(IntegrationCompositionError);
  });
});
