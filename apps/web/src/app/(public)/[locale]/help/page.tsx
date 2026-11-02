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

import {
  constructMetadata,
  constructOpengraphUrl,
  PUBLIC_DOMAIN,
} from "@virtbase/utils";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getExtracted, getLocale } from "next-intl/server";
import { getPopularArticles } from "@/features/help/articles.ts";
import { getHelpCategories } from "@/features/help/categories.tsx";
import { CategoryCard } from "@/features/help/components/category-card.tsx";
import { HelpArticleList } from "@/features/help/components/help-article-list.tsx";
import { HelpHeader } from "@/features/help/components/help-header.tsx";
import { constructAlternateLanguages } from "@/lib/hreflang.ts";
import { markdownUrl } from "@/lib/markdown-url.ts";

export async function generateMetadata(): Promise<Metadata> {
  "use cache";

  const locale = await getLocale();
  const t = await getExtracted();

  cacheLife("max");
  cacheTag("home", locale);

  const title = t("Help Center");
  const description = t(
    "Find answers to all your Virtbase-related questions in one place with our comprehensive Help Center.",
  );

  return constructMetadata({
    title,
    description,
    canonicalUrl: `${PUBLIC_DOMAIN}/${locale}/help`,
    languages: constructAlternateLanguages("/help"),
    markdownUrl: markdownUrl(locale, "/help"),
    image: constructOpengraphUrl({
      title,
      subtitle: description,
      slug: `/${locale}/help`,
      theme: "dark",
    }),
  });
}

export default async function HelpPage() {
  "use cache";

  const locale = await getLocale();
  const t = await getExtracted();

  cacheLife("max");
  cacheTag("home", locale);

  const categories = await getHelpCategories();
  const popular = getPopularArticles(locale);

  return (
    <>
      <HelpHeader title={t("How can we help today?")} />
      <main className="relative border-border border-t">
        <div className="mx-auto w-full max-w-5xl px-3 py-10 lg:px-4 xl:px-0">
          {popular.length > 0 && (
            <section className="mb-10 rounded-xl border border-border bg-background px-4 py-6">
              <h2 className="px-2 font-medium text-foreground text-xl sm:text-2xl">
                {t("Popular articles")}
              </h2>
              <HelpArticleList
                articles={popular}
                className="mt-4 md:grid-cols-2"
              />
            </section>
          )}
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {categories.map(({ slug, title, description, Icon }) => (
              <CategoryCard
                key={slug}
                href={`/help/category/${slug}`}
                icon={<Icon aria-hidden="true" />}
                title={title}
                description={description}
              />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
