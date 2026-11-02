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

import { createFromSource } from "fumadocs-core/search/server";
import { hasLocale } from "next-intl";

import { getHelpCategory } from "@/features/help/categories.tsx";
import { defaultLocale, locales } from "@/i18n/config.ts";
import { helpArticles } from "@/lib/source.ts";

export const { GET } = createFromSource(helpArticles, {
  // A result's breadcrumb is the article's primary category. Fumadocs would
  // otherwise derive one from a page tree the help center does not have, and
  // label every result "Docs".
  buildIndex: async (page) => {
    const locale = hasLocale(locales, page.locale)
      ? page.locale
      : defaultLocale;
    const category = await getHelpCategory(page.data.categories[0], locale);

    return {
      id: page.url,
      url: page.url,
      title: page.data.title,
      description: page.data.description,
      structuredData: page.data.structuredData,
      breadcrumbs: category ? [category.title] : [],
    };
  },
  localeMap: {
    de: { language: "german" },
    en: { language: "english" },
    fr: { language: "french" },
    nl: { language: "dutch" },
  },
});
