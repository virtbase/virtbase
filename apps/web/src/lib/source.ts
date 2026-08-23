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
  helpArticleCollection,
  legalCollection,
  marketingCollection,
} from "fdx-source/server";
import type { I18nConfig } from "fumadocs-core/i18n";
import { defineI18n } from "fumadocs-core/i18n";
import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import type { Locale } from "next-intl";

import { defaultLocale, locales } from "@/i18n/config";

const i18nConfig: I18nConfig = {
  languages: [...locales],
  defaultLanguage: defaultLocale,
  // Locales are directories (`en/terms.mdx`), not filename suffixes — the only
  // layout Crowdin can map onto a translation path.
  parser: "dir",
};

/**
 * Rendering config. A document with no file for the requested locale falls back
 * to the source locale, so a missing translation serves English rather than a
 * 404.
 */
const i18n = defineI18n(i18nConfig);

/**
 * Enumeration config. Disabling the fallback makes `getPages()` report only the
 * documents that really exist on disk, which is what `hreflang` and the sitemap
 * need — advertising a locale that silently serves English is worse than
 * advertising nothing.
 */
const translatedI18n = defineI18n({ ...i18nConfig, fallbackLanguage: null });

export const legal = loader({
  baseUrl: "/legal",
  source: toFumadocsSource(legalCollection, []),
  i18n,
});

/**
 * Landing and company pages. `marketing/<locale>/index.mdx` is the home page;
 * every other document is served at `/<locale>/<slug>`.
 */
export const marketing = loader({
  baseUrl: "/",
  source: toFumadocsSource(marketingCollection, []),
  i18n,
});

export const helpArticles = loader({
  baseUrl: "/help/article",
  source: toFumadocsSource(helpArticleCollection, []),
  i18n,
});

/**
 * The same collections without the locale fallback. Used only to answer "which
 * languages does this document actually have?" — never to render.
 */
const translated = {
  legal: loader({
    baseUrl: "/legal",
    source: toFumadocsSource(legalCollection, []),
    i18n: translatedI18n,
  }),
  marketing: loader({
    baseUrl: "/",
    source: toFumadocsSource(marketingCollection, []),
    i18n: translatedI18n,
  }),
  helpArticles: loader({
    baseUrl: "/help/article",
    source: toFumadocsSource(helpArticleCollection, []),
    i18n: translatedI18n,
  }),
};

export type ContentCollection = keyof typeof translated;

/**
 * The locales a document has an MDX file for, in the order locales are
 * declared.
 *
 * Translated documents are not guaranteed to be complete, so `hreflang` and the
 * sitemap must only advertise the languages that actually resolve.
 */
export function getDocumentLocales(
  collection: ContentCollection,
  slugs: readonly string[] = [],
): Locale[] {
  const slug = slugs.join("/");

  const documentLocales = new Set(
    translated[collection]
      .getPages()
      .filter((page) => page.slugs.join("/") === slug)
      .map((page) => page.locale),
  );

  return locales.filter((locale) => documentLocales.has(locale));
}
