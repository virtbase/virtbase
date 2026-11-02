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

import { Separator } from "@virtbase/ui/separator";
import {
  constructMetadata,
  constructOpengraphUrl,
  PUBLIC_DOMAIN,
} from "@virtbase/utils";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { getExtracted, getLocale } from "next-intl/server";
import { getAuthors } from "@/features/authors/authors.ts";
import { AuthorByline } from "@/features/authors/components/author-byline.tsx";
import { getRelatedArticles } from "@/features/help/articles.ts";
import { getHelpCategory } from "@/features/help/categories.tsx";
import { HelpArticleJsonLd } from "@/features/help/components/help-article-json-ld.tsx";
import { HelpBreadcrumb } from "@/features/help/components/help-breadcrumb.tsx";
import { HelpHeader } from "@/features/help/components/help-header.tsx";
import { RelatedArticles } from "@/features/help/components/related-articles.tsx";
import { defaultLocale } from "@/i18n/config.ts";
import { IntlLink } from "@/i18n/navigation.public.ts";
import { constructAlternateLanguages } from "@/lib/hreflang.ts";
import { markdownUrl } from "@/lib/markdown-url.ts";
import { getDocumentLocales, helpArticles } from "@/lib/source.ts";
import { TableOfContents } from "@/ui/fumadocs/table-of-contents.tsx";
import { helpMdxComponents } from "@/ui/mdx/article-components.tsx";
import { Prose } from "@/ui/prose.tsx";

export async function generateStaticParams() {
  return helpArticles.getPages().map((page) => ({
    locale: page.locale ?? defaultLocale,
    slug: page.slugs,
  }));
}

// instant = false: kept on purpose - the whole page is one cached document for this URL, so there is no shared shell to prefetch
export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/help/article/[[...slug]]">): Promise<Metadata> {
  "use cache";

  const { locale, slug } = await params;

  cacheLife("max");
  cacheTag("home", locale);

  const page = helpArticles.getPage(slug, locale);

  if (!page) {
    notFound();
  }

  const { title, description } = page.data;

  const languages = constructAlternateLanguages(
    `/help/article/${page.slugs.join("/")}`,
    getDocumentLocales("helpArticles", page.slugs),
  );

  return constructMetadata({
    title,
    description,
    // When the requested locale has no file of its own the page is served
    // through the fallback, so the canonical points at the locale that owns the
    // content rather than at a duplicate of it.
    canonicalUrl:
      languages[locale] ?? languages["x-default"] ?? PUBLIC_DOMAIN + page.url,
    languages,
    markdownUrl: markdownUrl(locale, `/help/article/${page.slugs.join("/")}`),
    image: constructOpengraphUrl({
      title,
      subtitle: description,
      slug: page.url,
      theme: "dark",
    }),
    keywords: page.data.keywords,
  });
}

export default async function HelpArticlePage({
  params,
}: PageProps<"/[locale]/help/article/[[...slug]]">) {
  "use cache";

  const locale = await getLocale();
  const slug = (await params).slug;

  cacheLife("max");
  cacheTag("home", locale);

  const page = helpArticles.getPage(slug, locale);
  if (!page) {
    notFound();
  }

  const MDX = page.data.body;

  const { title, description, lastModified } = page.data;

  const t = await getExtracted();

  const category = await getHelpCategory(page.data.categories[0]);
  const authors = getAuthors(page.data.authors, locale);

  return (
    <>
      <HelpHeader />
      <HelpArticleJsonLd
        url={PUBLIC_DOMAIN + page.url}
        locale={locale}
        title={title}
        description={description}
        lastModified={lastModified}
        authors={authors}
      />
      <main className="relative border-border border-t">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-4 gap-10 px-3 py-10 lg:px-4 xl:px-0">
          <div className="col-span-4 flex flex-col space-y-8 sm:col-span-3 sm:pr-10">
            <HelpBreadcrumb category={category} title={title} />
            <div className="flex flex-col space-y-4">
              <h1 className="font-medium text-3xl leading-snug sm:text-4xl">
                {title}
              </h1>
              <p className="text-muted-foreground">{description}</p>
              <AuthorByline authors={authors} lastModified={lastModified} />
            </div>
            <Prose>
              <MDX components={helpMdxComponents} />
            </Prose>
            <Separator />
            <RelatedArticles
              articles={getRelatedArticles(locale, page.data.related)}
            />
          </div>
          <div className="sticky top-20 col-span-1 hidden self-start sm:block">
            <TableOfContents items={page.data.toc} />
            <Separator className="mt-10 mb-5" />
            <IntlLink
              href="/contact"
              className="text-muted-foreground text-xs transition-colors hover:text-foreground/80"
              prefetch={false}
            >
              {t("Still have questions? Contact us ↗")}
            </IntlLink>
          </div>
        </div>
      </main>
    </>
  );
}
