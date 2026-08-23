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

import { APP_DOMAIN, PUBLIC_DOMAIN } from "@virtbase/utils";
import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { routing } from "@/i18n/routing.public";
import { constructAlternateLanguages } from "@/lib/hreflang";
import type { ContentCollection, TranslatedPage } from "@/lib/source";
import { getDocumentLocales, getTranslatedPages } from "@/lib/source";

type SitemapPage = MetadataRoute.Sitemap[number];

/**
 * Fumadocs bakes the locale into `page.url` (`/en/help/article/...`), while
 * `constructAlternateLanguages` expects a locale-agnostic path.
 */
function localelessPath(page: TranslatedPage) {
  return page.locale ? page.url.slice(page.locale.length + 1) : page.url;
}

function documentPages(collection: ContentCollection): SitemapPage[] {
  return getTranslatedPages(collection).map((page) => {
    // Only the marketing collection has an index document, and that is the
    // home page.
    const isHome = page.slugs.length === 0;

    return {
      url: PUBLIC_DOMAIN + page.url,
      lastModified: page.data.lastModified ?? new Date(),
      changeFrequency: "monthly",
      priority: isHome ? 1 : 0.5,
      alternates: {
        languages: constructAlternateLanguages(
          localelessPath(page),
          getDocumentLocales(collection, page.slugs),
        ),
      },
    } satisfies SitemapPage;
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";

  cacheTag("sitemap.xml");
  cacheLife("max");

  // Pages backed by a React route rather than a document. Everything in a
  // content collection — the home page included — is picked up below.
  const pages = ["/help", "/contact"] as const;
  const appPages = ["/login", "/register", "/forgot-password"] as const;

  return [
    // Special page without locale
    {
      url: `${PUBLIC_DOMAIN}/api/docs`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // Public pages have a locale - create entry for each locale
    ...routing.locales.flatMap((locale) =>
      pages.map(
        (page) =>
          ({
            url: `${PUBLIC_DOMAIN}/${locale}${page}`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.8,
            alternates: {
              languages: constructAlternateLanguages(page),
            },
          }) satisfies SitemapPage,
      ),
    ),
    // App pages have no locale - create entry for each app page
    ...appPages.map(
      (page) =>
        ({
          url: `${APP_DOMAIN}${page}`,
          priority: 0.1,
          changeFrequency: "yearly",
          lastModified: new Date(),
        }) satisfies SitemapPage,
    ),
    // Fumadocs collections have a locale, but already in the url
    ...documentPages("marketing"),
    ...documentPages("legal"),
    ...documentPages("helpArticles"),
  ];
}
