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

import { PUBLIC_DOMAIN } from "@virtbase/utils";
import { authors } from "@/lib/source.ts";

export type Author = ReturnType<typeof authors.getPages>[number];

/** An author in a locale, falling back to the source locale's file. */
export function getAuthor(slug: string, locale: string): Author | undefined {
  return authors.getPage([slug], locale);
}

/** The authors a document names, in its order. Unknown slugs are skipped. */
export function getAuthors(slugs: readonly string[], locale: string): Author[] {
  return slugs.flatMap((slug) => getAuthor(slug, locale) ?? []);
}

/** The author's page and their links elsewhere, as absolute URLs. */
export function getAuthorUrls(author: Author, locale: string) {
  return {
    url: `${PUBLIC_DOMAIN}/${locale}/authors/${author.slugs.join("/")}`,
    image: author.data.avatar && `${PUBLIC_DOMAIN}${author.data.avatar}`,
    sameAs: Object.values(author.data.links ?? {}).filter(
      (link): link is string => link !== undefined,
    ),
  };
}
