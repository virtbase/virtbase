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
import {
  renderVendorData,
  validateSnippetContent,
} from "../render-vendor-data";
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
  content: string,
  overrides: Partial<RenderableSnippet> = {},
): RenderableSnippet => ({
  slug,
  kind: "cloud-config",
  content,
  ...overrides,
});

const render = (
  snippets: RenderableSnippet[],
  context: SnippetTargetContext = debian13,
) => renderVendorData({ snippets, context });

const body = (content: string | null) => parse(content ?? "");

describe("renderVendorData", () => {
  test("returns null when nothing applies, so no file is uploaded", () => {
    const result = render([
      snippet("nope", "a: 1", { targets: { osFamily: ["freebsd"] } }),
    ]);

    expect(result.content).toBeNull();
    expect(result.applied).toEqual([]);
  });

  test("emits a #cloud-config header naming the snippets", () => {
    const result = renderVendorData({
      snippets: [snippet("one", "a: 1")],
      context: debian13,
      templateName: "Debian 13",
    });

    expect(result.content?.startsWith("#cloud-config\n")).toBe(true);
    expect(result.content).toContain("# template: Debian 13");
    expect(result.content).toContain("# snippets: one");
  });

  test("concatenates accumulating keys in snippet order", () => {
    const result = render([
      snippet("a", "packages: [curl]\nruncmd:\n  - [echo, a]", { priority: 1 }),
      snippet("b", "packages: [vim]\nruncmd:\n  - [echo, b]", { priority: 2 }),
    ]);

    const merged = body(result.content);
    expect(merged.packages).toEqual(["curl", "vim"]);
    expect(merged.runcmd).toEqual([
      ["echo", "a"],
      ["echo", "b"],
    ]);
    expect(result.conflicts).toEqual([]);
  });

  test("merges mappings recursively", () => {
    const result = render([
      snippet("a", "apt:\n  primary: mirror-a\n", { priority: 1 }),
      snippet("b", "apt:\n  proxy: http://proxy\n", { priority: 2 }),
    ]);

    expect(body(result.content).apt).toEqual({
      primary: "mirror-a",
      proxy: "http://proxy",
    });
  });

  test("reports a scalar a later snippet overrode", () => {
    const result = render([
      snippet("a", "ssh_pwauth: true", { priority: 1 }),
      snippet("b", "ssh_pwauth: false", { priority: 2 }),
    ]);

    // Applied, but never silently: an accidental override is the failure mode
    // that is hardest to spot in a merged document.
    expect(body(result.content).ssh_pwauth).toBe(false);
    expect(result.conflicts).toEqual([
      {
        path: "ssh_pwauth",
        previous: "true",
        next: "false",
        previousSlug: "a",
        nextSlug: "b",
      },
    ]);
  });

  test("does not report a re-assertion of the same value", () => {
    const result = render([
      snippet("a", "ssh_pwauth: true", { priority: 1 }),
      snippet("b", "ssh_pwauth: true", { priority: 2 }),
    ]);

    expect(result.conflicts).toEqual([]);
  });

  test("reports a conflict nested inside a mapping with its dotted path", () => {
    const result = render([
      snippet("a", "apt:\n  primary: mirror-a\n", { priority: 1 }),
      snippet("b", "apt:\n  primary: mirror-b\n", { priority: 2 }),
    ]);

    expect(result.conflicts[0]?.path).toBe("apt.primary");
  });

  test("a non-accumulating list is replaced, and reported", () => {
    const result = render([
      snippet("a", "device_aliases: [one]", { priority: 1 }),
      snippet("b", "device_aliases: [two]", { priority: 2 }),
    ]);

    expect(body(result.content).device_aliases).toEqual(["two"]);
    expect(result.conflicts).toHaveLength(1);
  });

  test("skips a snippet that does not parse, and reports where", () => {
    const result = render([
      snippet("good", "packages: [curl]", { priority: 1 }),
      // Genuinely malformed: an unclosed flow sequence. Note that a merely
      // *odd* indentation like "- a\n   - b" is valid YAML - it folds into one
      // scalar - so it would not exercise this path.
      snippet("broken", "packages: [curl, vim", { priority: 2 }),
    ]);

    // One bad snippet must not make the template unprovisionable.
    expect(body(result.content).packages).toEqual(["curl"]);
    expect(result.applied).toEqual(["good"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.slug).toBe("broken");
    expect(result.errors[0]?.line).toBeGreaterThan(0);
  });

  test("rejects a snippet whose top level is not a mapping", () => {
    const result = render([snippet("list", "- a\n- b\n")]);

    expect(result.content).toBeNull();
    expect(result.errors[0]?.message).toContain("mapping");
  });

  test("ignores a snippet that is only comments", () => {
    const result = render([
      snippet("comment", "# nothing here\n", { priority: 1 }),
      snippet("real", "packages: [curl]", { priority: 2 }),
    ]);

    expect(result.applied).toEqual(["real"]);
    expect(result.errors).toEqual([]);
  });

  test("writes a shell snippet to a file and runs it", () => {
    const result = render([
      snippet("harden", "#!/bin/sh\necho hardening\n", { kind: "shell" }),
    ]);

    const merged = body(result.content);
    // A file rather than an inlined `sh -c` string: no quoting hazards, and
    // whoever debugs a bad first boot can read and re-run it.
    expect(merged.write_files).toEqual([
      {
        path: "/var/lib/virtbase/cloud-init/harden.sh",
        permissions: "0755",
        content: "#!/bin/sh\necho hardening\n",
      },
    ]);
    expect(merged.runcmd).toEqual([
      ["sh", "/var/lib/virtbase/cloud-init/harden.sh"],
    ]);
  });

  test("a shell snippet's write_files accumulates with a cloud-config one", () => {
    const result = render([
      snippet("cfg", "write_files:\n  - path: /etc/a\n    content: a\n", {
        priority: 1,
      }),
      snippet("sh", "echo hi\n", { kind: "shell", priority: 2 }),
    ]);

    expect(body(result.content).write_files).toHaveLength(2);
  });

  test("does not fold long lines", () => {
    // cloud-init reads these as commands; a helpfully wrapped line changes
    // what actually runs.
    const long = `runcmd:\n  - [ sh, -c, '${"echo x && ".repeat(30)}true' ]\n`;
    const result = render([snippet("long", long)]);

    const lines = (result.content ?? "").split("\n");
    expect(lines.some((line) => line.length > 200)).toBe(true);
    expect(body(result.content).runcmd[0][2]).toContain("echo x &&");
  });

  test("is deterministic for the same inputs", () => {
    const snippets = [
      snippet("b", "packages: [b]"),
      snippet("a", "packages: [a]"),
    ];

    expect(render(snippets).content).toBe(render(snippets).content);
    // Input order must not matter - ordering comes from priority and slug.
    expect(render(snippets).content).toBe(
      render([...snippets].reverse()).content,
    );
  });
});

describe("validateSnippetContent", () => {
  test("accepts a valid mapping", () => {
    expect(validateSnippetContent("packages: [curl]")).toBeNull();
  });

  test("accepts an empty document", () => {
    expect(validateSnippetContent("# just a comment\n")).toBeNull();
  });

  test("reports a parse error with a position", () => {
    const error = validateSnippetContent("packages: [curl, vim");

    expect(error).not.toBeNull();
    expect(error?.line).toBeGreaterThan(0);
    expect(error?.column).toBeGreaterThan(0);
  });

  test("rejects a non-mapping top level", () => {
    expect(validateSnippetContent("- a\n")?.message).toContain("mapping");
  });

  test("never rejects a shell snippet", () => {
    expect(validateSnippetContent("this: is: not: yaml", "shell")).toBeNull();
  });
});
