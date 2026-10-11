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

/** The files every integration's `docs/` folder holds (ADR 0016). */
export const DOCS_FILES = [
  "README.md",
  "architecture.md",
  "configuration.md",
  "events.md",
  "data-model.md",
  "pages.md",
  "operations.md",
  "security.md",
  "testing.md",
] as const;

/**
 * The problems of an integration's docs (§4.7, check 8; ADR 0016): a missing
 * file, a file no longer than its template, and a file that still holds a
 * `TODO` placeholder. `files` maps each name to its content, or null when it
 * is missing.
 */
export const checkDocs = ({
  files,
  templates,
}: {
  files: Readonly<Record<string, string | null>>;
  templates: Readonly<Record<string, string>>;
}): string[] =>
  DOCS_FILES.flatMap((name) => {
    const content = files[name];
    if (content === null || content === undefined) {
      return [`docs/${name} is missing`];
    }
    const problems: string[] = [];
    if (content.trim().length <= (templates[name] ?? "").trim().length) {
      problems.push(`docs/${name} is no longer than its template`);
    }
    if (/\bTODO\b/.test(content)) {
      problems.push(`docs/${name} still holds a TODO placeholder`);
    }
    return problems;
  });
