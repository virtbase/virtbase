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

import type { TechArticle, WithContext } from "schema-dts";
import type { Author } from "@/features/authors/authors.ts";
import { getAuthorUrls } from "@/features/authors/authors.ts";
import { ORGANIZATION_ID } from "@/ui/seo/default-json-ld.tsx";
import JsonLd from "@/ui/seo/json-ld.tsx";

/**
 * `TechArticle` structured data for a help article: what it is, who wrote it,
 * and when it last changed. The publisher is a reference to the site-wide
 * organization node rather than a second description of it.
 */
export function HelpArticleJsonLd({
  url,
  image,
  locale,
  title,
  description,
  publishedAt,
  lastModified,
  authors,
}: {
  /** Absolute URL of the article. */
  url: string;
  /** Absolute URL of its OpenGraph image: 1200x630, the size Google asks for. */
  image: string;
  locale: string;
  title: string;
  description: string;
  publishedAt?: Date | undefined;
  lastModified?: Date | undefined;
  authors: Author[];
}) {
  const article: WithContext<TechArticle> = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description,
    url,
    mainEntityOfPage: url,
    image,
    inLanguage: locale,
    ...(publishedAt && { datePublished: publishedAt.toISOString() }),
    ...(lastModified && { dateModified: lastModified.toISOString() }),
    author: authors.map((author) => {
      const { url: authorUrl } = getAuthorUrls(author, locale);
      return {
        "@type": "Person",
        "@id": `${authorUrl}#person`,
        name: author.data.name,
        url: authorUrl,
      };
    }),
    publisher: { "@id": ORGANIZATION_ID },
  };

  return <JsonLd schema={article} />;
}
