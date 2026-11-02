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
import { notFound } from "next/navigation";
import { getCategoryArticles } from "@/features/help/articles.ts";
import { getHelpCategory } from "@/features/help/categories.tsx";
import { HelpArticleList } from "@/features/help/components/help-article-list.tsx";
import { HelpBreadcrumb } from "@/features/help/components/help-breadcrumb.tsx";
import { HelpCollectionJsonLd } from "@/features/help/components/help-collection-json-ld.tsx";
import { HelpHeader } from "@/features/help/components/help-header.tsx";
import { getHelpCategoryText } from "@/features/help/metadata.ts";
import { locales } from "@/i18n/config.ts";
import { HELP_CATEGORIES } from "@/lib/help-categories.ts";
import { constructAlternateLanguages } from "@/lib/hreflang.ts";
import { markdownUrl } from "@/lib/markdown-url.ts";
import { publicPath } from "@/lib/public-routes.ts";

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    HELP_CATEGORIES.map((category) => ({ locale, category })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/help/category/[category]">): Promise<Metadata> {
  "use cache";

  const { locale, category: slug } = await params;

  cacheLife("max");
  cacheTag("home", locale);

  const category = await getHelpCategory(slug);
  if (!category) {
    notFound();
  }

  const { title, description } = await getHelpCategoryText(category);
  const path = publicPath({ kind: "help-category", category: category.slug });

  return constructMetadata({
    title,
    description,
    canonicalUrl: `${PUBLIC_DOMAIN}/${locale}${path}`,
    languages: constructAlternateLanguages(path),
    markdownUrl: markdownUrl(locale, path),
    image: constructOpengraphUrl({
      title,
      subtitle: description,
      slug: `/${locale}${path}`,
      theme: "dark",
    }),
  });
}

export default async function HelpCategoryPage({
  params,
}: PageProps<"/[locale]/help/category/[category]">) {
  "use cache";

  const { locale, category: slug } = await params;

  cacheLife("max");
  cacheTag("home", locale);

  const category = await getHelpCategory(slug);
  if (!category) {
    notFound();
  }

  const articles = getCategoryArticles(locale, category.slug);
  const text = await getHelpCategoryText(category);

  return (
    <>
      <HelpHeader />
      <main className="relative border-border border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col px-3 py-10 lg:px-4 xl:px-0">
          <HelpBreadcrumb title={category.title} />
          <div className="my-8 flex flex-col space-y-4">
            <h1 className="font-medium text-2xl text-foreground sm:text-4xl">
              {category.title}
            </h1>
            <p className="text-muted-foreground">{category.description}</p>
          </div>
          <HelpArticleList
            articles={articles}
            className="rounded-xl border border-border bg-background p-4"
          />
        </div>
      </main>
      <HelpCollectionJsonLd
        url={`${PUBLIC_DOMAIN}/${locale}${publicPath({ kind: "help-category", category: category.slug })}`}
        name={text.title}
        description={text.description}
        items={articles.map((article) => ({
          name: article.data.title,
          url: PUBLIC_DOMAIN + article.url,
        }))}
      />
    </>
  );
}
