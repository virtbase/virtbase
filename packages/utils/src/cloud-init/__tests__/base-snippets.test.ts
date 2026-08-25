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
import { parse } from "yaml";
import { BASE_SNIPPETS } from "../base-snippets";
import {
  renderVendorData,
  validateSnippetContent,
} from "../render-vendor-data";
import type { SnippetTargetContext } from "../types";

/**
 * Golden-file coverage for the snippets every guest receives.
 *
 * These snapshots are the point of the test: a change here is a change to what
 * lands on every server Virtbase provisions, and it should have to be looked at
 * in review rather than noticed in production.
 */
const CONTEXTS: Record<string, SnippetTargetContext> = {
  "debian-13": {
    osFamily: "debian",
    packageManager: "apt",
    initSystem: "systemd",
    architecture: "amd64",
    osVersion: "13",
  },
  "almalinux-10": {
    osFamily: "rhel",
    packageManager: "dnf",
    initSystem: "systemd",
    architecture: "amd64",
    osVersion: "10",
  },
  "freebsd-14.2": {
    osFamily: "freebsd",
    packageManager: "pkg",
    initSystem: "bsd-rc",
    architecture: "amd64",
    osVersion: "14.2",
  },
};

const render = (context: SnippetTargetContext) =>
  renderVendorData({ snippets: BASE_SNIPPETS, context });

describe("BASE_SNIPPETS", () => {
  test("every snippet is valid on its own", () => {
    for (const snippet of BASE_SNIPPETS) {
      const error = validateSnippetContent(snippet.content, snippet.kind);
      expect(`${snippet.slug}: ${error?.message ?? "ok"}`).toBe(
        `${snippet.slug}: ok`,
      );
    }
  });

  test("slugs are unique", () => {
    const slugs = BASE_SNIPPETS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  for (const [name, context] of Object.entries(CONTEXTS)) {
    test(`renders without conflicts or errors for ${name}`, () => {
      const result = render(context);

      expect(result.errors).toEqual([]);
      // A conflict among the base snippets means two of them disagree, which
      // is a bug in the base set rather than something to surface to an admin.
      expect(result.conflicts).toEqual([]);
      expect(result.content).not.toBeNull();
    });

    test(`snapshot: ${name}`, () => {
      expect(render(context).content).toMatchSnapshot();
    });
  }

  test("the guest agent is installed everywhere the package exists", () => {
    for (const name of ["debian-13", "almalinux-10"]) {
      const context = CONTEXTS[name] as SnippetTargetContext;
      const merged = parse(render(context).content ?? "");

      // Agent-backed features depend on this being present.
      expect(merged.packages).toContain("qemu-guest-agent");
    }
  });

  test("root can log in over SSH on every base target", () => {
    for (const context of Object.values(CONTEXTS)) {
      const merged = parse(render(context).content ?? "");

      expect(merged.ssh_pwauth).toBe(true);
      expect(merged.disable_root).toBe(false);
    }
  });

  test("FreeBSD gets the inline sshd edit instead of a drop-in only", () => {
    // The demonstration that per-image behaviour is data now: FreeBSD's sshd
    // has no Include for sshd_config.d, so the drop-in alone would do nothing.
    const freebsd = render(CONTEXTS["freebsd-14.2"] as SnippetTargetContext);
    const debian = render(CONTEXTS["debian-13"] as SnippetTargetContext);

    expect(freebsd.applied).toContain("base-sshd-inline");
    expect(debian.applied).not.toContain("base-sshd-inline");
  });

  test("FreeBSD does not get an apt/dnf guest agent install", () => {
    const freebsd = render(CONTEXTS["freebsd-14.2"] as SnippetTargetContext);

    expect(freebsd.applied).not.toContain("base-guest-agent");
  });

  test("the default user sweep applies everywhere", () => {
    for (const context of Object.values(CONTEXTS)) {
      expect(render(context).applied).toContain("base-remove-default-users");
    }
  });
});
