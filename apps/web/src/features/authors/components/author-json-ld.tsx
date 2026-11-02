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

import type { ProfilePage, WithContext } from "schema-dts";
import type { Author } from "@/features/authors/authors.ts";
import { getAuthorUrls } from "@/features/authors/authors.ts";
import JsonLd from "@/ui/seo/json-ld.tsx";

/**
 * `ProfilePage` structured data for an author's page. The person carries the
 * same `@id` that every article's `author` points at, so a crawler can join
 * them.
 */
export function AuthorJsonLd({
  author,
  locale,
}: {
  author: Author;
  locale: string;
}) {
  const { url, image, sameAs } = getAuthorUrls(author, locale);
  const { name, role, lastModified } = author.data;

  const profile: WithContext<ProfilePage> = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url,
    ...(lastModified && { dateModified: lastModified.toISOString() }),
    mainEntity: {
      "@type": "Person",
      "@id": `${url}#person`,
      name,
      url,
      ...(role && { jobTitle: role }),
      ...(image && { image }),
      ...(sameAs.length > 0 && { sameAs }),
    },
  };

  return <JsonLd schema={profile} />;
}
