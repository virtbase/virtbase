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
import { helpArticles, legal } from "@/lib/source";

type SitemapPage = MetadataRoute.Sitemap[number];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";

  cacheTag("sitemap.xml");
  cacheLife("max");

  const pages = ["/", "/help", "/contact"] as const;
  const appPages = ["/login", "/register", "/forgot-password"] as const;

  const collections = [legal, helpArticles];

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
            url: `${PUBLIC_DOMAIN}/${locale}${page === "/" ? "" : page}`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: page === "/" ? 1 : 0.8,
            alternates: {
              languages: {
                ...Object.assign(
                  {},
                  ...routing.locales
                    .filter((currentLocale) => currentLocale !== locale)
                    .map((currentLocale) => ({
                      [currentLocale]: `${PUBLIC_DOMAIN}/${currentLocale}${page === "/" ? "" : page}`,
                    })),
                ),
              },
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
    ...collections.flatMap((collection) => {
      const pages = collection.getPages();
      return pages.map(
        (page) =>
          ({
            url: PUBLIC_DOMAIN + page.url,
            lastModified: page.data.lastModified ?? new Date(),
            priority: 0.5,
            alternates: {
              languages: {
                ...Object.assign(
                  {},
                  ...pages
                    // Page has the same path (without locale)
                    .filter(
                      (currentPage) =>
                        currentPage.slugs.join("/") === page.slugs.join("/"),
                    )
                    // Page has a locale
                    .filter((currentPage) => Boolean(currentPage.locale))
                    // Page has a different locale
                    .filter((currentPage) => currentPage.locale !== page.locale)
                    .map((currentPage) => ({
                      [currentPage.locale as string]:
                        PUBLIC_DOMAIN + currentPage.url,
                    })),
                ),
              },
            },
          }) satisfies SitemapPage,
      );
    }),
  ];
}
