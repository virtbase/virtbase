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
 * A stable string for a payload, so "did this change?" is a string comparison.
 *
 * Discord answers with more fields than it accepts — `id`, `application_id`,
 * `version`, and defaults it filled in itself. Comparing raw responses to the
 * desired payload would report drift on every probe and re-register forever,
 * so both sides are reduced to the same shape first:
 *
 * - keys not in `keep` are dropped,
 * - `null`, `undefined`, empty objects and empty arrays are dropped, because
 *   Discord omits and nulls the same absent value interchangeably,
 * - object keys are sorted, so key order never counts as a difference.
 */
export const canonical = (value: unknown, keep?: readonly string[]): string =>
  JSON.stringify(normalize(value, keep));

/**
 * `keep` applies to the records being compared, not to everything beneath them.
 *
 * An array is a collection of records, so it passes `keep` to its elements. An
 * object's own properties are that record's contents and are kept whole — a
 * command's `options` must survive intact, or two commands differing only in
 * their arguments would compare equal.
 */
const normalize = (value: unknown, keep?: readonly string[]): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry, keep));
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !keep || keep.includes(key))
      .map(([key, entry]) => [key, normalize(entry)] as const)
      .filter(([, entry]) => !isAbsent(entry))
      .sort(([a], [b]) => a.localeCompare(b));

    return Object.fromEntries(entries);
  }

  return value;
};

const isAbsent = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
};
