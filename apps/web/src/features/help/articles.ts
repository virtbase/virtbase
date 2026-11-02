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

import type { HelpCategory } from "@/lib/help-categories.ts";
import { helpArticles } from "@/lib/source.ts";

export type HelpArticle = ReturnType<typeof helpArticles.getPages>[number];

/** Every article in a locale, falling back to the source locale's file. */
function getArticles(locale: string) {
  return helpArticles.getPages().filter((page) => page.locale === locale);
}

/** The articles flagged `popular`, in the order of their rank. */
export function getPopularArticles(locale: string): HelpArticle[] {
  return getArticles(locale)
    .filter((page) => page.data.popular !== undefined)
    .sort((a, b) => (a.data.popular ?? 0) - (b.data.popular ?? 0));
}

/**
 * The articles filed under a category, popular ones first in the order of
 * their rank, then the rest alphabetically.
 */
export function getCategoryArticles(
  locale: string,
  category: HelpCategory,
): HelpArticle[] {
  const rank = (page: HelpArticle) =>
    page.data.popular ?? Number.POSITIVE_INFINITY;

  return getArticles(locale)
    .filter((page) => page.data.categories.includes(category))
    .sort(
      (a, b) =>
        rank(a) - rank(b) || a.data.title.localeCompare(b.data.title, locale),
    );
}
