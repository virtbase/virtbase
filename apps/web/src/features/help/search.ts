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

import type { SortedResult } from "fumadocs-core/search";
import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "next-intl";
import { getPopularArticles } from "@/features/help/articles.ts";
import { getHelpCategories } from "@/features/help/categories.tsx";

/**
 * The popular articles as search results, which the search dialog lists
 * before anything has been typed. Each carries its primary category as the
 * breadcrumb, like a result the search itself returns.
 */
export async function getPopularSearchResults(
  locale: Locale,
): Promise<SortedResult[]> {
  "use cache";

  cacheLife("max");
  cacheTag("home", locale);

  const categories = await getHelpCategories(locale);

  return getPopularArticles(locale).map((article) => {
    const category = categories.find(
      ({ slug }) => slug === article.data.categories[0],
    );
    return {
      id: article.url,
      url: article.url,
      type: "page",
      content: article.data.title,
      ...(category && { breadcrumbs: [category.title] }),
    };
  });
}
