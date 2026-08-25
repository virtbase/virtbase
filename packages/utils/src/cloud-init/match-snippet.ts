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

import type {
  RenderableSnippet,
  SnippetTargetContext,
  SnippetTargets,
} from "./types";

/**
 * Compares two dotted version strings numerically, segment by segment.
 *
 * `"24.04"` vs `"9"` has to come out as 24 > 9, which a string comparison gets
 * backwards - and distro versions are exactly where that matters. A segment
 * that is not a number (`"10-stream"`) compares by its leading digits, then
 * lexically, so `"10-stream"` still sorts above `"9"`.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    const l = left[i] ?? "0";
    const r = right[i] ?? "0";

    const ln = Number.parseInt(l, 10);
    const rn = Number.parseInt(r, 10);

    const lIsNum = !Number.isNaN(ln);
    const rIsNum = !Number.isNaN(rn);

    if (lIsNum && rIsNum) {
      if (ln !== rn) return ln < rn ? -1 : 1;

      // Same leading number - a suffix like `-stream` breaks the tie so that
      // "10-stream" and "10" are not treated as identical.
      const lRest = l.slice(String(ln).length);
      const rRest = r.slice(String(rn).length);
      if (lRest !== rRest) return lRest < rRest ? -1 : 1;
      continue;
    }

    if (l !== r) return l < r ? -1 : 1;
  }

  return 0;
}

const COMPARISON = /^(>=|<=|>|<|=)?\s*(.+)$/;

/**
 * Evaluates a range expression against a version.
 *
 * The grammar is deliberately tiny: comparisons separated by whitespace, all of
 * which must hold. `">=12"`, `">=9 <11"`, `"24.04"`. Anything richer would need
 * a real semver parser, and distro versions are not semver.
 */
export function satisfiesVersionRange(
  version: string | null | undefined,
  range: string,
): boolean {
  const trimmed = range.trim();
  if (!trimmed) return true;

  // A range was requested but the template does not say what it is - refuse
  // rather than guess, so an untargeted snippet cannot leak onto an unknown OS.
  if (!version) return false;

  for (const term of trimmed.split(/\s+/)) {
    const match = term.match(COMPARISON);
    if (!match) return false;

    const [, operator = "=", operand] = match;
    if (!operand) return false;

    const comparison = compareVersions(version, operand);

    const ok =
      operator === ">="
        ? comparison >= 0
        : operator === "<="
          ? comparison <= 0
          : operator === ">"
            ? comparison > 0
            : operator === "<"
              ? comparison < 0
              : comparison === 0;

    if (!ok) return false;
  }

  return true;
}

const matchesList = (
  allowed: string[] | undefined,
  value: string | null | undefined,
): boolean => {
  if (!allowed || allowed.length === 0) return true;
  if (!value) return false;

  return allowed.some(
    (candidate) => candidate.toLowerCase() === value.toLowerCase(),
  );
};

/**
 * Whether a selector matches a template's metadata. An empty selector matches
 * everything; every declared dimension must hold.
 */
export function matchesTargets(
  targets: SnippetTargets | null | undefined,
  context: SnippetTargetContext,
): boolean {
  if (!targets) return true;

  if (!matchesList(targets.osFamily, context.osFamily)) return false;
  if (!matchesList(targets.packageManager, context.packageManager))
    return false;
  if (!matchesList(targets.initSystem, context.initSystem)) return false;
  if (!matchesList(targets.architecture, context.architecture)) return false;

  if (
    targets.osVersionRange &&
    !satisfiesVersionRange(context.osVersion, targets.osVersionRange)
  ) {
    return false;
  }

  return true;
}

/**
 * Picks the snippets that apply to a template and puts them in the order they
 * will be composed.
 *
 * Selection is selector-then-override: `attached` decides outright when it is
 * set, which is what lets one awkward template opt in or out without contorting
 * a selector that is right for everything else.
 *
 * Ordering is priority then slug. The slug tie-break is what makes the rendered
 * document deterministic, and therefore diffable - two snippets at the same
 * priority must not swap places between runs.
 */
export function selectSnippets(
  snippets: RenderableSnippet[],
  context: SnippetTargetContext,
): RenderableSnippet[] {
  return snippets
    .filter((snippet) => {
      if (snippet.enabled === false) return false;
      if (snippet.attached === false) return false;
      if (snippet.attached === true) return true;

      return matchesTargets(snippet.targets, context);
    })
    .sort((a, b) => {
      const ap = a.priorityOverride ?? a.priority ?? 0;
      const bp = b.priorityOverride ?? b.priority ?? 0;

      return ap !== bp ? ap - bp : a.slug.localeCompare(b.slug);
    });
}
