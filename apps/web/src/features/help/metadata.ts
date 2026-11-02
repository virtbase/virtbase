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

import { getExtracted, getFormatter } from "next-intl/server";
import type { HelpCategoryDetails } from "@/features/help/categories.tsx";
import { getHelpCategories } from "@/features/help/categories.tsx";

/**
 * Title and description of the help center's index, in the request's locale,
 * for its metadata and its structured data alike. The description names every
 * category, so it stays accurate as categories come and go.
 */
export async function getHelpCenterText() {
  const t = await getExtracted();
  const format = await getFormatter();
  const categories = await getHelpCategories();

  return {
    title: t("Help Center"),
    description: t("Guides and answers for your Virtbase servers: {topics}.", {
      topics: format.list(categories.map((category) => category.title)),
    }),
  };
}

/**
 * Title and description of a category's page. The visible heading is the
 * bare category name; the `<title>` says which site section it belongs to, and
 * the description is the category's own sentence followed by what the page
 * holds.
 */
export async function getHelpCategoryText(category: HelpCategoryDetails) {
  const t = await getExtracted();

  return {
    title: `${category.title} – ${t("Help Center")}`,
    description: `${category.description} ${t("Step-by-step guides and answers from the Virtbase Help Center.")}`,
  };
}
