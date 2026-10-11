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

/** Every string inside a value, at any depth. */
const collectStrings = (
  value: unknown,
  seen = new WeakSet<object>(),
): string[] => {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (value instanceof Error) {
    return [value.message, ...collectStrings(value.cause, seen)];
  }
  return Object.values(value).flatMap((entry) => collectStrings(entry, seen));
};

/**
 * Every output that holds a secret value (§4.7, check 9; §10). `outputs` maps
 * a description of each output to its value; every string inside it, an
 * error's message and cause chain included, is searched as it is, so a secret
 * with line breaks or quotes is found too.
 */
export const findSecretLeaks = ({
  outputs,
  secrets,
}: {
  outputs: Readonly<Record<string, unknown>>;
  secrets: readonly string[];
}): string[] =>
  Object.entries(outputs).flatMap(([where, value]) => {
    const strings = collectStrings(value);
    return secrets.some(
      (secret) =>
        secret.length > 0 && strings.some((text) => text.includes(secret)),
    )
      ? [`${where} contains a secret value`]
      : [];
  });
