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

import { PUBLIC_DOMAIN } from "@virtbase/utils";
import type { DocMethods } from "fumadocs-mdx/runtime/types";
import type { Locale } from "next-intl";
import { getExtracted } from "next-intl/server";
import { getAuthor } from "@/features/authors/authors.ts";
import type { HelpArticle } from "@/features/help/articles.ts";
import {
  getAuthorArticles,
  getCategoryArticles,
  getPopularArticles,
} from "@/features/help/articles.ts";
import {
  getHelpCategories,
  getHelpCategory,
} from "@/features/help/categories.tsx";
import type { HelpCategory } from "@/lib/help-categories.ts";
import type { ContentRoute } from "@/lib/public-routes.ts";
import {
  hasMarkdown,
  matchPublicRoute,
  publicPath,
} from "@/lib/public-routes.ts";
import { helpArticles, legal, marketing } from "@/lib/source.ts";
import { getMarkdownComponents } from "@/ui/mdx/markdown-components.tsx";

type Document = { data: Pick<DocMethods, "getText"> };

/**
 * Links and images written as site-relative paths - `/en/legal/privacy`, a
 * bundled screenshot under `/_next/static` - made absolute, so the Markdown
 * still resolves once an agent has copied it somewhere else.
 */
function absolutize(markdown: string) {
  return markdown.replace(/\]\((<?)\//g, `]($1${PUBLIC_DOMAIN}/`);
}

async function render(document: Document, locale: Locale) {
  const components = await getMarkdownComponents(locale);
  return absolutize(await document.data.getText("processed", { components }));
}

function list(articles: HelpArticle[]) {
  return articles
    .map(
      (article) =>
        `- [${article.data.title}](${PUBLIC_DOMAIN}${article.url}): ${article.data.description}`,
    )
    .join("\n");
}

async function helpIndex(locale: Locale) {
  const t = await getExtracted({ locale });
  const categories = await getHelpCategories(locale);

  return [
    `# ${t("Help Center")}`,
    `## ${t("Popular articles")}`,
    list(getPopularArticles(locale)),
    ...categories.flatMap((category) => [
      `## [${category.title}](${PUBLIC_DOMAIN}/${locale}${publicPath({ kind: "help-category", category: category.slug })})`,
      category.description,
      list(getCategoryArticles(locale, category.slug)),
    ]),
  ].join("\n\n");
}

async function helpCategory(locale: Locale, slug: HelpCategory) {
  const category = await getHelpCategory(slug, locale);
  if (!category) return null;

  return [
    `# ${category.title}`,
    category.description,
    list(getCategoryArticles(locale, category.slug)),
  ].join("\n\n");
}

async function author(locale: Locale, slug: string) {
  const page = getAuthor(slug, locale);
  if (!page) return null;

  const t = await getExtracted({ locale });
  const { name, role, links = {} } = page.data;
  const articles = getAuthorArticles(locale, slug);

  return [
    `# ${name}`,
    role,
    Object.values(links)
      .filter(Boolean)
      .map((link) => `- <${link}>`)
      .join("\n"),
    await render(page, locale),
    articles.length > 0 && `## ${t("Help articles")}`,
    list(articles),
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function document(route: ContentRoute, locale: Locale) {
  switch (route.kind) {
    case "help-article": {
      const page = helpArticles.getPage(route.slugs, locale);
      if (!page) return null;
      const { title, description } = page.data;
      return `# ${title}\n\n${description}\n\n${await render(page, locale)}`;
    }
    case "legal": {
      const page = legal.getPage(route.slugs, locale);
      if (!page) return null;
      return `# ${page.data.title}\n\n${await render(page, locale)}`;
    }
    case "marketing": {
      const page = marketing.getPage(route.slugs, locale);
      return page ? render(page, locale) : null;
    }
    default:
      return null;
  }
}

/**
 * The Markdown of a public page, by its locale-less path segments, or `null`
 * when the page does not exist or has no Markdown form.
 *
 * Documents keep their own structure: help articles and legal texts gain the
 * title and description that the HTML page renders from frontmatter, while a
 * marketing page already opens with its own `#` heading. The help center's
 * index, its categories and author pages are React pages, so their Markdown is
 * assembled from the same data.
 */
export async function getPageMarkdown(
  locale: Locale,
  segments: readonly string[],
): Promise<string | null> {
  const route = matchPublicRoute(segments);
  if (!hasMarkdown(route)) return null;

  switch (route.kind) {
    case "help":
      return helpIndex(locale);
    case "help-category":
      return helpCategory(locale, route.category);
    case "author":
      return author(locale, route.slug);
    default:
      return document(route, locale);
  }
}
