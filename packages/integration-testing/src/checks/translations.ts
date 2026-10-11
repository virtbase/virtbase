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

import type { LocalizedIntegrationText } from "@virtbase/integration-sdk";
import type { IntegrationManifest } from "@virtbase/integration-sdk/manifest";

/** Every string inside the localized text, with where it is. */
const listStrings = (
  value: unknown,
  path: string,
): { path: string; text: string }[] => {
  if (typeof value === "string") return [{ path, text: value }];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    listStrings(entry, path ? `${path}.${key}` : key),
  );
};

/**
 * The problems of `localize()`'s result (§4.7, check 3; ADR 0018):
 *
 * - the name, the description or a field label is missing;
 * - a string did not come through the translator, which `isTranslated`
 *   decides, so a literal returned without `t()` is never extracted.
 *
 * Select-option labels and error messages are not checked:
 * `LocalizedIntegrationText` has no keys for them until the typed
 * `localize()` of ADR 0018 replaces it.
 */
export const checkTranslations = (
  manifest: IntegrationManifest,
  localized: LocalizedIntegrationText,
  isTranslated: (text: string) => boolean,
): string[] => {
  const problems: string[] = [];
  if (!localized.name) problems.push("localize: no name");
  if (!localized.description) problems.push("localize: no description");
  const fields = [
    ...(manifest.settings?.fields ?? []),
    ...(manifest.secrets?.fields ?? []),
  ];
  for (const field of fields) {
    if (!localized.fields?.[field.key]?.label) {
      problems.push(`localize: no label for field ${field.key}`);
    }
  }
  for (const { path, text } of listStrings(localized, "")) {
    if (!isTranslated(text)) {
      problems.push(`localize: ${path} is not passed through t()`);
    }
  }
  return problems;
};

/**
 * The problems of the namespaces `localize()` asked `getExtracted` for: none
 * at all, or any other than `<id>-integration` (ADR 0018).
 */
export const checkNamespaces = (
  integrationId: string,
  namespaces: readonly (string | undefined)[],
): string[] => {
  const expected = `${integrationId}-integration`;
  if (namespaces.length === 0) return ["localize: never calls getExtracted"];
  return [...new Set(namespaces)]
    .filter((namespace) => namespace !== expected)
    .map(
      (namespace) =>
        `localize: uses the namespace ${namespace ?? "(none)"} instead of ${expected}`,
    );
};
