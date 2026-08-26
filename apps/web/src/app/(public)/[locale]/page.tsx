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

import { constructAlternateLanguages } from "@/lib/hreflang";
import { getDocumentLocales, marketing } from "@/lib/source";
import { marketingMdxComponents } from "@/ui/mdx/marketing-components";

/** The home page is `marketing/<locale>/index.mdx`, which has no slug. */
const HOME_SLUGS: string[] = [];

export async function generateMetadata(): Promise<Metadata> {
  "use cache";

  const locale = await getLocale();

  cacheLife("max");
  cacheTag("home", locale);

  const page = marketing.getPage(HOME_SLUGS, locale);

  if (!page) {
    notFound();
  }

  const { title, description, keywords } = page.data;

  const languages = constructAlternateLanguages(
    "",
    getDocumentLocales("marketing", HOME_SLUGS),
  );

  return constructMetadata({
    // `title`, not `fullTitle`, so the brand is appended for the `<title>` tag
    // and left off the OpenGraph image — which renders "Virtbase" in its own
    // footer, and pushes a three-line headline into it. This matches how every
    // other marketing document is built.
    title,
    description,
    // When the requested locale has no file of its own the page is served
    // through the fallback, so the canonical points at the locale that owns the
    // content rather than at a duplicate of it.
    canonicalUrl:
      languages[locale] ??
      languages["x-default"] ??
      `${PUBLIC_DOMAIN}/${locale}`,
    languages,
    image: constructOpengraphUrl({
      title,
      subtitle: description,
      slug: `/${locale}`,
      theme: "dark",
    }),
    keywords,
  });
}

export default async function Page() {
  "use cache";

  const locale = await getLocale();

  cacheLife("max");
  cacheTag("home", locale);

  const page = marketing.getPage(HOME_SLUGS, locale);

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
