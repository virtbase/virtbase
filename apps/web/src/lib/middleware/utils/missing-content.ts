/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { defaultLocale } from "@/i18n/config.ts";
import { isHelpCategory } from "@/lib/help-categories.ts";

/** @internal */
export const ROUTED_SEGMENTS: ReadonlySet<string> = new Set([
  "checkout",
  "contact",
  "help",
  "legal",
  "upsell",
]);

type Documents = Readonly<Record<string, unknown>>;

export type ContentDocuments = {
  marketing: Documents;
  legal: Documents;
  help: Documents;
};

function hasDocument(documents: Documents, locale: string, slugs: string[]) {
  const path = slugs.join("/");

  return [locale, defaultLocale].some(
    (owner) =>
      `${owner}/${path}.mdx` in documents ||
      `${owner}/${path}/index.mdx` in documents,
  );
}

export function isMissingContent(
  content: ContentDocuments,
  locale: string,
  segments: string[],
) {
  const [first, ...rest] = segments;

  if (first === undefined) {
    return false;
  }

  if (first === "legal") {
    return rest.length > 0 && !hasDocument(content.legal, locale, rest);
  }

  if (first === "help") {
    const [kind, ...slugs] = rest;
    if (kind === undefined) return false;
    if (kind === "article") {
      return slugs.length > 0 && !hasDocument(content.help, locale, slugs);
    }
    if (kind === "category") {
      return !(slugs.length === 1 && isHelpCategory(slugs[0]));
    }
    return true;
  }

  if (ROUTED_SEGMENTS.has(first)) {
    return false;
  }

  return !hasDocument(content.marketing, locale, segments);
}
