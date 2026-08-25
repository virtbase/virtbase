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
  compareVersions,
  matchesTargets,
  satisfiesVersionRange,
  selectSnippets,
} from "../match-snippet";
import type { RenderableSnippet, SnippetTargetContext } from "../types";

const debian13: SnippetTargetContext = {
  osFamily: "debian",
  packageManager: "apt",
  initSystem: "systemd",
  architecture: "amd64",
  osVersion: "13",
};

const snippet = (
  slug: string,
  overrides: Partial<RenderableSnippet> = {},
): RenderableSnippet => ({
  slug,
  kind: "cloud-config",
  content: "a: 1",
  ...overrides,
});

describe("compareVersions", () => {
  const cases: [string, string, number][] = [
    ["13", "13", 0],
    ["13", "12", 1],
    ["12", "13", -1],
    // The case a string comparison gets backwards.
    ["24.04", "9", 1],
    ["9", "24.04", -1],
    ["22.04", "22.10", -1],
    ["10", "10.0", 0],
    ["10-stream", "10", 1],
    ["10-stream", "9", 1],
  ];

  for (const [a, b, expected] of cases) {
    test(`${a} vs ${b} -> ${expected}`, () => {
      expect(Math.sign(compareVersions(a, b))).toBe(expected);
    });
  }
});

describe("satisfiesVersionRange", () => {
  const cases: [string, string, boolean][] = [
    ["13", ">=12", true],
    ["11", ">=12", false],
    ["12", ">=12", true],
    ["10", ">=9 <11", true],
    ["11", ">=9 <11", false],
    ["24.04", ">=22.04", true],
    ["20.04", ">=22.04", false],
    ["24.04", "24.04", true],
    ["24.10", "24.04", false],
    ["13", "<=13", true],
    ["9", ">8", true],
  ];

  for (const [version, range, expected] of cases) {
    test(`${version} satisfies "${range}" -> ${expected}`, () => {
      expect(satisfiesVersionRange(version, range)).toBe(expected);
    });
  }

  test("an empty range matches anything", () => {
    expect(satisfiesVersionRange("13", "")).toBe(true);
    expect(satisfiesVersionRange(null, "  ")).toBe(true);
  });

  test("a range against an unknown version refuses rather than guesses", () => {
    // Better to leave a snippet off than apply an OS-specific one blind.
    expect(satisfiesVersionRange(null, ">=12")).toBe(false);
  });
});

describe("matchesTargets", () => {
  test("an empty or absent selector matches everything", () => {
    expect(matchesTargets(undefined, debian13)).toBe(true);
    expect(matchesTargets({}, debian13)).toBe(true);
  });

  test("every declared dimension has to hold", () => {
    expect(matchesTargets({ osFamily: ["debian"] }, debian13)).toBe(true);
    expect(
      matchesTargets(
        { osFamily: ["debian"], architecture: ["arm64"] },
        debian13,
      ),
    ).toBe(false);
  });

  test("matches case-insensitively", () => {
    expect(matchesTargets({ osFamily: ["Debian"] }, debian13)).toBe(true);
  });

  test("a dimension the template does not declare fails a selector", () => {
    expect(
      matchesTargets({ packageManager: ["apt"] }, { osFamily: "debian" }),
    ).toBe(false);
  });

  test("combines a list with a version range", () => {
    expect(
      matchesTargets(
        { osFamily: ["debian", "ubuntu"], osVersionRange: ">=12" },
        debian13,
      ),
    ).toBe(true);
    expect(
      matchesTargets(
        { osFamily: ["debian"], osVersionRange: ">=14" },
        debian13,
      ),
    ).toBe(false);
  });
});

describe("selectSnippets", () => {
  test("orders by priority, then slug", () => {
    const selected = selectSnippets(
      [
        snippet("zulu", { priority: 10 }),
        snippet("alpha", { priority: 10 }),
        snippet("first", { priority: 1 }),
      ],
      debian13,
    );

    // The slug tie-break is what makes the rendered document diffable.
    expect(selected.map((s) => s.slug)).toEqual(["first", "alpha", "zulu"]);
  });

  test("treats a missing priority as 0", () => {
    const selected = selectSnippets(
      [snippet("later", { priority: 5 }), snippet("earlier")],
      debian13,
    );

    expect(selected.map((s) => s.slug)).toEqual(["earlier", "later"]);
  });

  test("a per-template priority override wins", () => {
    const selected = selectSnippets(
      [
        snippet("a", { priority: 1 }),
        snippet("b", { priority: 99, priorityOverride: 0 }),
      ],
      debian13,
    );

    expect(selected.map((s) => s.slug)).toEqual(["b", "a"]);
  });

  test("skips disabled snippets", () => {
    const selected = selectSnippets(
      [snippet("on"), snippet("off", { enabled: false })],
      debian13,
    );

    expect(selected.map((s) => s.slug)).toEqual(["on"]);
  });

  test("attached=true overrides a selector that would not match", () => {
    const selected = selectSnippets(
      [
        snippet("forced", {
          targets: { osFamily: ["freebsd"] },
          attached: true,
        }),
      ],
      debian13,
    );

    expect(selected.map((s) => s.slug)).toEqual(["forced"]);
  });

  test("attached=false overrides a selector that would match", () => {
    const selected = selectSnippets(
      [
        snippet("suppressed", {
          targets: { osFamily: ["debian"] },
          attached: false,
        }),
      ],
      debian13,
    );

    expect(selected).toHaveLength(0);
  });

  test("filters by selector when there is no override", () => {
    const selected = selectSnippets(
      [
        snippet("apt-only", { targets: { packageManager: ["apt"] } }),
        snippet("pkg-only", { targets: { packageManager: ["pkg"] } }),
      ],
      debian13,
    );

    expect(selected.map((s) => s.slug)).toEqual(["apt-only"]);
  });
});
