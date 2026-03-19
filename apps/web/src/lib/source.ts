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

import { helpArticleCollection, legalCollection } from "fdx-source/server";
import { defineI18n } from "fumadocs-core/i18n";
import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";

import { defaultLocale, locales } from "@/i18n/config";

const i18n = defineI18n({
  languages: [...locales],
  defaultLanguage: defaultLocale,
});

export const legal = loader({
  baseUrl: "/legal",
  source: toFumadocsSource(legalCollection, []),
  i18n,
});

export const helpArticles = loader({
  baseUrl: "/help/article",
  source: toFumadocsSource(helpArticleCollection, []),
  i18n,
});
