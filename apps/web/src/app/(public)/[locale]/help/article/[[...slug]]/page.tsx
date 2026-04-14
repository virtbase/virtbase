/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { cn } from "@virtbase/ui";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@virtbase/ui/breadcrumb";
import { Separator } from "@virtbase/ui/separator";
import {
  constructMetadata,
  constructOpengraphUrl,
  PUBLIC_DOMAIN,
} from "@virtbase/utils";
import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import { Step, Steps } from "fumadocs-ui/components/steps";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getExtracted, getFormatter, getLocale } from "next-intl/server";
import { defaultLocale } from "@/i18n/config";
import { IntlLink } from "@/i18n/navigation.public";
import { helpArticles } from "@/lib/source";
import { HelpHint } from "@/ui/fumadocs/help-hint";
import { TableOfContents } from "@/ui/fumadocs/table-of-contents";

export async function generateStaticParams() {
  return helpArticles.getPages().map((page) => ({
    locale: page.locale ?? defaultLocale,
    slug: page.slugs,
  }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/help/article/[[...slug]]">): Promise<Metadata> {
  const { locale, slug } = await params;

  const page = helpArticles.getPage(slug, locale);

  if (!page) {
    notFound();
  }

  return constructMetadata({
    title: page.data.title,
    description: page.data.description,
    canonicalUrl: PUBLIC_DOMAIN + page.url,
    image: constructOpengraphUrl({
      title: page.data.title,
      subtitle: page.data.description,
      slug: page.url,
      theme: "dark",
    }),
    keywords: page.data.keywords,
  });
}

export default async function HelpArticlePage({
  params,
}: PageProps<"/[locale]/help/article/[[...slug]]">) {
  const locale = await getLocale();
  const slug = (await params).slug;

  const page = helpArticles.getPage(slug, locale);
  if (!page) {
    notFound();
  }

  const MDX = page.data.body;

  const title = page.data.title;
  const description = page.data.description;
  const lastModified = page.data.lastModified;

  const t = await getExtracted();
  const format = await getFormatter();

  return (
    <main className="relative border-border border-t">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-4 gap-10 px-3 py-10 lg:px-4 xl:px-0">
        <div className="col-span-4 flex flex-col space-y-8 sm:col-span-3 sm:pr-10">
          <Breadcrumb className="text-muted-foreground text-sm">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <IntlLink href="/help" prefetch={false}>
                    {t("All articles")}
                  </IntlLink>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-muted-foreground">
                  {title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex flex-col space-y-4">
            <h1 className="font-medium text-3xl leading-snug sm:text-4xl">
              {title}
            </h1>
            <p className="text-muted-foreground">{description}</p>
            <div className="flex items-center space-x-3">
              {lastModified && (
                <time
                  dateTime={lastModified.toISOString()}
                  className="font-light text-muted-foreground text-sm"
                >
                  {t("Last updated: {date}", {
                    date: format.dateTime(lastModified),
                  })}
                </time>
              )}
            </div>
          </div>
          <article
            className={cn(
              "prose prose-neutral dark:prose-invert prose-headings:relative w-full max-w-none prose-headings:scroll-mt-20",
              "prose-a:font-medium prose-a:text-muted-foreground prose-thead:text-lg prose-a:underline-offset-4 transition-all prose-a:hover:text-foreground",
              "prose-headings:prose-a:text-foreground prose-headings:prose-a:no-underline",
            )}
          >
            <MDX
              components={{
                ...defaultMdxComponents,
                Steps,
                Step,
                img: ({ src, ...props }) => (
                  <ImageZoom
                    className="rounded-lg border border-border"
                    src={src as string}
                    {...props}
                  />
                ),
                Hint: HelpHint,
              }}
            />
          </article>
          <Separator />
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
  );
}
