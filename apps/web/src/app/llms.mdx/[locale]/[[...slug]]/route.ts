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
import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "next-intl";
import { hasLocale } from "next-intl";
import { getPageMarkdown } from "@/features/markdown/page-markdown.ts";
import { locales } from "@/i18n/config.ts";

async function getMarkdown(locale: Locale, slug: string[]) {
  "use cache";

  cacheLife("max");
  cacheTag("home", locale);

  return getPageMarkdown(locale, slug);
}

/**
 * A public page as Markdown, for agents. Never addressed directly: the proxy
 * rewrites here when a request prefers `text/markdown`, and `next.config.ts`
 * maps a page's URL with `.md` appended.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/llms.mdx/[locale]/[[...slug]]">,
) {
  const { locale, slug = [] } = await params;

  const markdown = hasLocale(locales, locale)
    ? await getMarkdown(locale, slug)
    : null;

  if (markdown === null) {
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(`${markdown}\n`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      // The HTML and the Markdown share a URL.
      Vary: "Accept",
      // The HTML page is the one to index; this is the same content again.
      "X-Robots-Tag": "noindex",
      Link: `<${PUBLIC_DOMAIN}/${[locale, ...slug].join("/")}>; rel="canonical"`,
    },
  });
}
