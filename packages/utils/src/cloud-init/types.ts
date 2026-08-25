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

/**
 * The template metadata a snippet selector is matched against. A structural
 * subset of the template row, so the renderer never depends on the database.
 */
export interface SnippetTargetContext {
  osFamily?: string | null;
  packageManager?: string | null;
  initSystem?: string | null;
  architecture?: string | null;
  osVersion?: string | null;
}

/**
 * Which templates a snippet applies to. Every field is a whitelist and an
 * omitted field means "do not care", so an empty selector matches everything.
 */
export interface SnippetTargets {
  osFamily?: string[];
  packageManager?: string[];
  initSystem?: string[];
  architecture?: string[];
  /**
   * A space-separated conjunction of comparisons against `osVersion`, e.g.
   * `">=12"`, `">=9 <11"`, or a bare `"24.04"` for equality.
   */
  osVersionRange?: string;
}

export type SnippetKind = "cloud-config" | "shell";

/**
 * One snippet as the renderer sees it. Mirrors `cloudInitSnippets` minus the
 * columns composition does not need.
 */
export interface RenderableSnippet {
  slug: string;
  kind: SnippetKind;
  content: string;
  targets?: SnippetTargets | null;
  priority?: number | null;
  enabled?: boolean;
  /**
   * Per-template override from `templateSnippets`. `true` forces the snippet
   * on regardless of its selector, `false` forces it off, `undefined` leaves
   * the selector to decide.
   */
  attached?: boolean;
  /** Per-template priority override from `templateSnippets`. */
  priorityOverride?: number | null;
}

/**
 * A key a later snippet overwrote rather than extended. Surfaced instead of
 * being applied silently: an accidental override is the failure mode that is
 * hardest to notice in a merged document.
 */
export interface RenderConflict {
  /** Dotted path of the overwritten key, e.g. `"ssh_pwauth"`. */
  path: string;
  /** The value that lost, rendered for display. */
  previous: string;
  /** The value that won. */
  next: string;
  /** Slug that set the losing value. */
  previousSlug: string;
  /** Slug that set the winning value. */
  nextSlug: string;
}

export interface RenderError {
  slug: string;
  message: string;
  /** 1-indexed, when the parser could locate the problem. */
  line?: number;
  column?: number;
}

export interface RenderVendorDataResult {
  /**
   * The composed `#cloud-config` document, or null when no snippet applied -
   * in which case no vendor-data file should be uploaded at all.
   */
  content: string | null;
  /** Slugs that contributed, in the order they were applied. */
  applied: string[];
  conflicts: RenderConflict[];
  /**
   * Snippets that could not be parsed. They are skipped rather than aborting
   * the render, so one broken snippet cannot make every template unprovisionable.
   */
  errors: RenderError[];
}
