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
import { getExtracted } from "next-intl/server";
import { getAuthor } from "@/features/authors/authors.ts";
import { AuthorHeader } from "@/features/authors/components/author-header.tsx";
import { AuthorJsonLd } from "@/features/authors/components/author-json-ld.tsx";
import { getAuthorArticles } from "@/features/help/articles.ts";
import { HelpArticleCard } from "@/features/help/components/help-article-card.tsx";
import { defaultLocale } from "@/i18n/config.ts";
import { constructAlternateLanguages } from "@/lib/hreflang.ts";
import { authors, getDocumentLocales } from "@/lib/source.ts";
import { Prose } from "@/ui/prose.tsx";

export function generateStaticParams() {
  return authors.getPages().map((page) => ({
    locale: page.locale ?? defaultLocale,
    slug: page.slugs.join("/"),
  }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/authors/[slug]">): Promise<Metadata> {
  "use cache";

  const { locale, slug } = await params;

  cacheLife("max");
  cacheTag("home", locale);

  const author = getAuthor(slug, locale);
  if (!author) {
    notFound();
  }

  const t = await getExtracted();
  const { name, role } = author.data;
  const description = t("Help articles written by {name}.", { name });
  const languages = constructAlternateLanguages(
    `/authors/${slug}`,
    getDocumentLocales("authors", [slug]),
  );

  return constructMetadata({
    title: name,
    description,
    // As for help articles: a locale served through the fallback points at
    // the locale that owns the document.
    canonicalUrl:
      languages[locale] ?? languages["x-default"] ?? PUBLIC_DOMAIN + author.url,
    languages,
    image: constructOpengraphUrl({
      title: name,
      subtitle: role ?? description,
      slug: author.url,
      theme: "dark",
    }),
  });
}

export default async function AuthorPage({
  params,
}: PageProps<"/[locale]/authors/[slug]">) {
  "use cache";

  const { locale, slug } = await params;

  cacheLife("max");
  cacheTag("home", locale);

  const author = getAuthor(slug, locale);
  if (!author) {
    notFound();
  }

  const t = await getExtracted();
  const Bio = author.data.body;
  const articles = getAuthorArticles(locale, slug);

  return (
    <>
      <AuthorHeader author={author} />
      <main className="relative border-border border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-3 py-10 lg:px-4 xl:px-0">
          {author.data.structuredData.contents.length > 0 && (
            <Prose className="max-w-3xl">
              <Bio />
            </Prose>
          )}
          {articles.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="font-medium text-foreground text-xl sm:text-2xl">
                {t("Help articles")}
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {articles.map((article) => (
                  <HelpArticleCard key={article.url} article={article} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
      <AuthorJsonLd author={author} locale={locale} />
    </>
  );
}
