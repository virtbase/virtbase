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

import { PUBLIC_DOMAIN } from "@virtbase/utils";
import type { Locale } from "next-intl";

import { defaultLocale, locales } from "@/i18n/config";

/**
 * Builds the `hreflang` map for a locale-agnostic path, for use as
 * `alternates.languages` in metadata and as `alternates.languages` in the
 * sitemap.
 *
 * The map is self-referential — it contains an entry for every locale the page
 * exists in, including the one being rendered. That is what the hreflang spec
 * requires; a map that omits the current page is ignored by crawlers.
 *
 * `availableLocales` exists for translated documents: a help article that has
 * no Dutch file must not advertise a Dutch URL that 404s.
 *
 * @param path Locale-agnostic path with a leading slash, or `""` for the home
 *   page.
 * @example constructAlternateLanguages("/help")
 */
export function constructAlternateLanguages(
  path: string,
  availableLocales: readonly Locale[] = locales,
): Record<string, string> {
  const href = (locale: Locale) => `${PUBLIC_DOMAIN}/${locale}${path}`;

  const languages: Record<string, string> = Object.fromEntries(
    availableLocales.map((locale) => [locale, href(locale)]),
  );

  // `x-default` points crawlers at the version to serve when no `hreflang`
  // matches the user. Prefer the source locale, but stay correct for documents
  // that have not been translated into it.
  const fallbackLocale = availableLocales.includes(defaultLocale)
    ? defaultLocale
    : availableLocales[0];

  if (fallbackLocale) {
    languages["x-default"] = href(fallbackLocale);
  }

  return languages;
}
