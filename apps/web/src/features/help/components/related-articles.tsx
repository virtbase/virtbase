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

import { getExtracted } from "next-intl/server";
import type { HelpArticle } from "@/features/help/articles.ts";
import { HelpArticleList } from "@/features/help/components/help-article-list.tsx";

/** The articles an article lists as related, under its content. */
export async function RelatedArticles({
  articles,
}: {
  articles: HelpArticle[];
}) {
  if (articles.length === 0) return null;

  const t = await getExtracted();

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-medium text-foreground text-xl sm:text-2xl">
        {t("Related articles")}
      </h2>
      <HelpArticleList
        articles={articles}
        className="rounded-xl border border-border bg-background p-4"
      />
    </section>
  );
}
