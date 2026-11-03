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

import { APP_NAME, PUBLIC_DOMAIN } from "@virtbase/utils";
import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "next-intl";
import { getExtracted } from "next-intl/server";
import { getGlossaryText } from "@/features/glossary/glossary.ts";
import { getCategoryArticles } from "@/features/help/articles.ts";
import { getHelpCategories } from "@/features/help/categories.tsx";
import { defaultLocale, locales } from "@/i18n/config.ts";
import { API_DISCOVERY } from "@/lib/api-discovery.ts";
import { publicPath } from "@/lib/public-routes.ts";
import { legal, marketing } from "@/lib/source.ts";

type Entry = { title: string; url: string; description?: string };

function link({ title, url, description }: Entry) {
  return `- [${title}](${url}.md)${description ? `: ${description}` : ""}`;
}

function pagesOf<T extends { locale?: string | undefined }>(
  pages: T[],
  locale: Locale,
) {
  return pages.filter((page) => page.locale === locale);
}

/**
 * One section per help category, each article under its primary category
 * only, so no article is listed twice.
 */
async function helpSections(locale: Locale, helpCenter: string) {
  const categories = await getHelpCategories(locale);

  return categories.flatMap((category) => {
    const articles = getCategoryArticles(locale, category.slug).filter(
      (article) => article.data.categories[0] === category.slug,
    );
    if (articles.length === 0) return [];
    return [
      `## ${helpCenter}: ${category.title}`,
      articles
        .map((article) =>
          link({
            title: article.data.title,
            url: PUBLIC_DOMAIN + article.url,
            description: article.data.description,
          }),
        )
        .join("\n"),
    ];
  });
}

/** The other locales' files, each language under its own name. */
function otherLocales(locale: Locale) {
  return locales
    .filter((other) => other !== locale)
    .map((other) => {
      const name = new Intl.DisplayNames([other], { type: "language" }).of(
        other,
      );
      const path = other === defaultLocale ? "" : `/${other}`;
      const label = name
        ? name.charAt(0).toLocaleUpperCase(other) + name.slice(1)
        : other;
      return `- [${label}](${PUBLIC_DOMAIN}${path}/llms.txt)`;
    })
    .join("\n");
}

/**
 * `llms.txt` for one locale, per https://llmstxt.org: a title, a summary, then
 * sections of links. Every link points at a page's Markdown form, which is
 * what an agent reading this file wants next. The help center comes first.
 */
async function getLlmsTxt(locale: Locale): Promise<string> {
  const t = await getExtracted({ locale });
  const home = marketing.getPage([], locale);

  const site = pagesOf(marketing.getPages(), locale)
    .filter((page) => page.slugs.length > 0)
    .map((page) =>
      link({
        title: page.data.title,
        url: PUBLIC_DOMAIN + page.url,
        description: page.data.description,
      }),
    );

  const legalPages = pagesOf(legal.getPages(), locale).map((page) =>
    link({ title: page.data.title, url: PUBLIC_DOMAIN + page.url }),
  );

  const glossary = await getGlossaryText(locale);

  return [
    `# ${APP_NAME}`,
    home && `> ${home.data.description}`,
    t(
      "Every page linked here is also available as Markdown: append .md to its URL, or request it with the header Accept: text/markdown.",
    ),
    ...(await helpSections(locale, t("Help Center"))),
    `## ${t("Help Center")}: ${glossary.title}`,
    link({
      title: glossary.title,
      url: `${PUBLIC_DOMAIN}/${locale}${publicPath({ kind: "help-glossary" })}`,
      description: glossary.description,
    }),
    `## ${APP_NAME}`,
    site.join("\n"),
    `## ${t("Legal")}`,
    legalPages.join("\n"),
    "## API",
    [
      `- [${t("API Documentation")}](${API_DISCOVERY.docs})`,
      `- [OpenAPI](${API_DISCOVERY.openapi})`,
    ].join("\n"),
    "## Optional",
    otherLocales(locale),
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function getCachedLlmsTxt(locale: Locale) {
  "use cache";

  cacheLife("max");
  cacheTag("home", locale);

  return getLlmsTxt(locale);
}

/** The `llms.txt` response for a locale. */
export async function llmsTxtResponse(locale: Locale) {
  return new Response(`${await getCachedLlmsTxt(locale)}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
