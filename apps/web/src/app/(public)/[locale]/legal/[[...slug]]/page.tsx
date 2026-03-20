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
  constructMetadata,
  constructOpengraphUrl,
  PUBLIC_DOMAIN,
} from "@virtbase/utils";
import { Step, Steps } from "fumadocs-ui/components/steps";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getExtracted, getFormatter, getLocale } from "next-intl/server";
import { defaultLocale } from "@/i18n/config";
import { legal } from "@/lib/source";
import { BlockWrapper } from "@/ui/block-wrapper";
import { TableOfContents } from "@/ui/fumadocs/table-of-contents";

export async function generateStaticParams() {
  return legal.getPages().map((page) => ({
    locale: page.locale ?? defaultLocale,
    slug: page.slugs,
  }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/legal/[[...slug]]">): Promise<Metadata> {
  const locale = await getLocale();
  const slug = (await params).slug;

  const page = legal.getPage(slug, locale);

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
  });
}

export default async function LegalPage({
  params,
}: PageProps<"/[locale]/legal/[[...slug]]">) {
  const locale = await getLocale();
  const slug = (await params).slug;

  const page = legal.getPage(slug, locale);
  if (!page) {
    notFound();
  }

  const format = await getFormatter();
  const t = await getExtracted();

  const lastModified = page.data.lastModified ?? new Date();

  const MDX = page.data.body;

  return (
    <main>
      <BlockWrapper variant="hero-full">
        <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
          <h1 className="mt-5 text-center font-medium text-4xl text-foreground sm:text-5xl sm:leading-[1.15]">
            {page.data.title}
          </h1>
        </div>
      </BlockWrapper>
      <BlockWrapper>
        <div className="grid grid-cols-4 gap-10 bg-background p-8 sm:p-12 lg:gap-20">
          <div className="col-span-4 md:col-span-3">
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
                }}
              />
            </article>
          </div>
          <div className="hidden md:block">
            <div className="sticky top-20 flex-col">
              <TableOfContents items={page.data.toc} />
            </div>
          </div>
        </div>
      </BlockWrapper>
      <BlockWrapper className="px-4 py-10">
        <p className="text-center text-muted-foreground text-sm">
          {t("Last updated: {date}", {
            date: format.dateTime(lastModified),
          })}
        </p>
      </BlockWrapper>
    </main>
  );
}
