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

import { parse, stringify, YAMLParseError } from "yaml";
import { selectSnippets } from "./match-snippet";
import type {
  RenderableSnippet,
  RenderConflict,
  RenderError,
  RenderVendorDataResult,
  SnippetTargetContext,
} from "./types";

/**
 * Keys whose lists accumulate across snippets instead of replacing each other.
 *
 * These are the cloud-config keys that describe "things to do" rather than "how
 * something is configured". Two snippets both adding a package must end up with
 * both packages; two snippets both setting `ssh_pwauth` genuinely conflict, and
 * that is reported.
 *
 * Anything not listed here is last-wins, which keeps the rule predictable: a
 * key either obviously accumulates, or the later snippet is overriding on
 * purpose and the caller is told about it.
 */
const ACCUMULATING_KEYS = new Set([
  "bootcmd",
  "runcmd",
  "packages",
  "write_files",
  "users",
  "groups",
  "ssh_authorized_keys",
]);

/** Where a shell snippet's script is written inside the guest. */
const SCRIPT_DIRECTORY = "/var/lib/virtbase/cloud-init";

type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Renders a value compactly enough to show in a conflict report. */
const display = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

/**
 * Merges one snippet's cloud-config into the accumulator, recording any key it
 * overwrote rather than extended.
 */
function mergeInto({
  target,
  source,
  slug,
  owners,
  conflicts,
  path = [],
}: {
  target: PlainObject;
  source: PlainObject;
  slug: string;
  /** Which snippet last set each dotted path, for conflict attribution. */
  owners: Map<string, string>;
  conflicts: RenderConflict[];
  path?: string[];
}): void {
  for (const [key, value] of Object.entries(source)) {
    const dotted = [...path, key].join(".");
    const existing = target[key];

    if (Array.isArray(value) && ACCUMULATING_KEYS.has(key)) {
      const previous = Array.isArray(existing) ? existing : [];
      target[key] = [...previous, ...value];
      owners.set(dotted, slug);
      continue;
    }

    if (isPlainObject(value) && isPlainObject(existing)) {
      mergeInto({
        target: existing,
        source: value,
        slug,
        owners,
        conflicts,
        path: [...path, key],
      });
      continue;
    }

    if (existing !== undefined && display(existing) !== display(value)) {
      conflicts.push({
        path: dotted,
        previous: display(existing),
        next: display(value),
        previousSlug: owners.get(dotted) ?? "unknown",
        nextSlug: slug,
      });
    }

    target[key] = value;
    owners.set(dotted, slug);
  }
}

/**
 * Turns a shell snippet into cloud-config.
 *
 * Written to a file and then executed, rather than inlined into `runcmd` as a
 * single `sh -c` string. Two reasons: quoting a multi-line script into a YAML
 * scalar is a reliable source of subtle breakage, and a script that exists on
 * the box can be read and re-run by whoever is debugging a bad first boot.
 */
function shellSnippetToCloudConfig(snippet: RenderableSnippet): PlainObject {
  const path = `${SCRIPT_DIRECTORY}/${snippet.slug}.sh`;

  return {
    write_files: [
      {
        path,
        permissions: "0755",
        content: snippet.content.endsWith("\n")
          ? snippet.content
          : `${snippet.content}\n`,
      },
    ],
    runcmd: [["sh", path]],
  };
}

export interface RenderVendorDataParams {
  snippets: RenderableSnippet[];
  context: SnippetTargetContext;
  /** Shown in the document header, purely to make a rendered file self-describing. */
  templateName?: string;
}

/**
 * Composes a template's snippets into the single `#cloud-config` document that
 * is uploaded as cloud-init vendor data.
 *
 * Deterministic: the same inputs always produce byte-identical output, which is
 * what makes the golden-file tests meaningful and lets a change to what every
 * guest receives show up as a reviewable diff.
 *
 * A snippet that does not parse is skipped and reported rather than throwing.
 * One malformed snippet must not make every template unprovisionable, and the
 * admin console can show the error where it can actually be fixed.
 */
export function renderVendorData({
  snippets,
  context,
  templateName,
}: RenderVendorDataParams): RenderVendorDataResult {
  const selected = selectSnippets(snippets, context);

  const merged: PlainObject = {};
  const owners = new Map<string, string>();
  const conflicts: RenderConflict[] = [];
  const errors: RenderError[] = [];
  const applied: string[] = [];

  for (const snippet of selected) {
    let config: PlainObject;

    if (snippet.kind === "shell") {
      // A shell snippet is a script, not YAML - nothing to parse.
      if (!snippet.content.trim()) continue;
      config = shellSnippetToCloudConfig(snippet);
    } else {
      let parsed: unknown;
      try {
        parsed = parse(snippet.content);
      } catch (error) {
        errors.push({
          slug: snippet.slug,
          message:
            error instanceof Error ? error.message : "could not parse YAML",
          ...(error instanceof YAMLParseError && error.linePos?.[0]
            ? {
                line: error.linePos[0].line,
                column: error.linePos[0].col,
              }
            : {}),
        });
        continue;
      }

      // An empty document is legitimate - a snippet whose body is only comments.
      if (parsed === null || parsed === undefined) continue;

      if (!isPlainObject(parsed)) {
        errors.push({
          slug: snippet.slug,
          message: "a cloud-config snippet must be a mapping at the top level",
        });
        continue;
      }

      config = parsed;
    }

    mergeInto({
      target: merged,
      source: config,
      slug: snippet.slug,
      owners,
      conflicts,
    });
    applied.push(snippet.slug);
  }

  if (applied.length === 0) {
    return { content: null, applied, conflicts, errors };
  }

  const header = [
    "#cloud-config",
    "# Generated by Virtbase - do not edit on the guest, edit the snippets.",
    ...(templateName ? [`# template: ${templateName}`] : []),
    `# snippets: ${applied.join(", ")}`,
  ].join("\n");

  // `lineWidth: 0` disables folding: cloud-init reads these as commands and
  // file contents, and a helpfully wrapped long line changes what runs.
  const body = stringify(merged, { lineWidth: 0 });

  return {
    content: `${header}\n${body}`,
    applied,
    conflicts,
    errors,
  };
}

/**
 * Parses a snippet body the way the renderer will, for validation at save time.
 * Returns null when it is valid, or the error with a position when it is not.
 */
export function validateSnippetContent(
  content: string,
  kind: RenderableSnippet["kind"] = "cloud-config",
): RenderError | null {
  if (kind === "shell") return null;

  try {
    const parsed = parse(content);

    if (parsed === null || parsed === undefined) return null;

    if (!isPlainObject(parsed)) {
      return {
        slug: "",
        message: "a cloud-config snippet must be a mapping at the top level",
      };
    }

    return null;
  } catch (error) {
    return {
      slug: "",
      message: error instanceof Error ? error.message : "could not parse YAML",
      ...(error instanceof YAMLParseError && error.linePos?.[0]
        ? { line: error.linePos[0].line, column: error.linePos[0].col }
        : {}),
    };
  }
}
