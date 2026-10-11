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

import type { IntegrationManifest } from "./manifest";
import { IntegrationManifestSchema, SDK_API_VERSION } from "./manifest";
import type { Integration } from "./types";

/** Thrown when the composition root lists integrations that cannot work together. */
export class IntegrationCompositionError extends Error {
  override readonly name = "IntegrationCompositionError";
}

/**
 * Whether `manifest.requires.apiVersion` admits {@link SDK_API_VERSION}. A
 * manifest that states no range is written against the current contract.
 */
export const isSdkApiSupported = (manifest: IntegrationManifest): boolean =>
  manifest.requires?.apiVersion === undefined ||
  Bun.semver.satisfies(SDK_API_VERSION, manifest.requires.apiVersion);

/**
 * Every reason `integrations` cannot be composed, empty when they can: a
 * duplicate id; a manifest that does not parse; a `requires.apiVersion` this
 * SDK does not satisfy, which ADR 0003 says fails at composition time; or a
 * `provides` list that differs from the runtime's factories (§4.2 and §4.3 of
 * integration-first.md).
 */
export const findCompositionProblems = (
  integrations: readonly Integration[],
): string[] => {
  const seen = new Set<string>();
  return integrations.flatMap((integration) => {
    const duplicate = seen.has(integration.id)
      ? [`${integration.id}: listed twice`]
      : [];
    seen.add(integration.id);
    return [...duplicate, ...findManifestProblems(integration)];
  });
};

/** The problems of one integration's manifest; none for a v1 definition. */
const findManifestProblems = (integration: Integration): string[] => {
  const { manifest } = integration;
  if (!manifest) return [];
  const problems: string[] = [];
  const parsed = IntegrationManifestSchema.safeParse(manifest);
  for (const issue of parsed.error?.issues ?? []) {
    problems.push(
      `${integration.id}: manifest ${issue.path.join(".") || "(root)"} ${issue.message}`,
    );
  }
  if (!isSdkApiSupported(manifest)) {
    problems.push(
      `${integration.id}: requires SDK ${manifest.requires?.apiVersion}, this is ${SDK_API_VERSION}`,
    );
  }
  const declared = [...(manifest.provides ?? [])].sort();
  const implemented = Object.keys(integration.provides).sort();
  if (declared.join(",") !== implemented.join(",")) {
    problems.push(
      `${integration.id}: manifest provides [${declared.join(", ")}] but the runtime implements [${implemented.join(", ")}]`,
    );
  }
  return problems;
};
