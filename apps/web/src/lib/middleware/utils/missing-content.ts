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
import { matchPublicRoute } from "@/lib/public-routes.ts";

type Documents = Readonly<Record<string, unknown>>;

export type ContentDocuments = {
  marketing: Documents;
  legal: Documents;
  help: Documents;
  authors: Documents;
};

function hasDocument(documents: Documents, locale: string, slugs: string[]) {
  const path = slugs.join("/");

  return [locale, defaultLocale].some(
    (owner) =>
      `${owner}/${path}.mdx` in documents ||
      `${owner}/${path}/index.mdx` in documents,
  );
}

/**
 * Whether a locale-prefixed public path names a document that does not exist,
 * or a path no route serves. The proxy answers both with a real 404.
 *
 * An index with no slugs (the home page, `/legal`, `/help/article`) and the
 * pages with no document behind them are left to their routes.
 */
export function isMissingContent(
  content: ContentDocuments,
  locale: string,
  segments: string[],
) {
  const route = matchPublicRoute(segments);
  const missing = (documents: Documents, slugs: string[]) =>
    slugs.length > 0 && !hasDocument(documents, locale, slugs);

  switch (route?.kind) {
    case undefined:
      return true;
    case "marketing":
      return missing(content.marketing, route.slugs);
    case "legal":
      return missing(content.legal, route.slugs);
    case "help-article":
      return missing(content.help, route.slugs);
    case "author":
      return missing(content.authors, [route.slug]);
    default:
      return false;
  }
}
