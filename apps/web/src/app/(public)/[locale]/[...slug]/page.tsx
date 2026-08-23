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

import {
  constructMetadata,
  constructOpengraphUrl,
  PUBLIC_DOMAIN,
} from "@virtbase/utils";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { defaultLocale } from "@/i18n/config";
import { constructAlternateLanguages } from "@/lib/hreflang";
import { getDocumentLocales, marketing } from "@/lib/source";
import { marketingMdxComponents } from "@/ui/mdx/marketing-components";

/**
 * Marketing pages — company, team, hardware and the like — rendered from
 * `packages/content/marketing/<locale>/<slug>.mdx`.
 *
 * This sits alongside the static segments (`help`, `legal`, `contact`, …),
 * which Next resolves first, so it only ever sees paths none of them claimed.
 * `generateStaticParams` is driven off the collection, so a document is the
 * only thing that creates a page here; anything else 404s.
 *
 * The home page is `index.mdx` and has no slug, so it is served by the sibling
 * `page.tsx` rather than by this route.
 */
export async function generateStaticParams() {
  return marketing
    .getPages()
    .filter((page) => page.slugs.length > 0)
    .map((page) => ({
      locale: page.locale ?? defaultLocale,
      slug: [...page.slugs],
    }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/[...slug]">): Promise<Metadata> {
  "use cache";

  const { locale, slug } = await params;

  cacheLife("max");
  cacheTag("marketing", locale);

  const page = marketing.getPage(slug, locale);

  if (!page) {
    notFound();
  }

  const { title, description, keywords } = page.data;

  const languages = constructAlternateLanguages(
    `/${page.slugs.join("/")}`,
    getDocumentLocales("marketing", page.slugs),
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
    image: constructOpengraphUrl({
      title,
      subtitle: description,
      slug: page.url,
      theme: "dark",
    }),
    keywords,
  });
}

export default async function MarketingPage({
  params,
}: PageProps<"/[locale]/[...slug]">) {
  "use cache";

  const locale = await getLocale();
  const { slug } = await params;

  cacheLife("max");
  cacheTag("marketing", locale);

  const page = marketing.getPage(slug, locale);

  if (!page) {
    notFound();
  }

  const MDX = page.data.body;

  return (
    <main>
      <MDX components={marketingMdxComponents} />
    </main>
  );
}
