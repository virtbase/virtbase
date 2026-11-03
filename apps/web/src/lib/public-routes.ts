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

import type { HelpCategory } from "@/lib/help-categories.ts";
import { isHelpCategory } from "@/lib/help-categories.ts";

/**
 * The static folders under `(public)/[locale]`. Every other first segment is a
 * marketing document. A test fails until a new folder is listed here.
 *
 * @internal Read by tests.
 */
export const ROUTED_SEGMENTS: ReadonlySet<string> = new Set([
  "authors",
  "checkout",
  "contact",
  "help",
  "legal",
  // A route handler. Its path contains a dot, so the proxy never sees it; it
  // is listed because every static folder under `[locale]` must be.
  "llms.txt",
  "upsell",
]);

/**
 * A public page with content behind it, by what it shows. Matching says
 * nothing about whether the document exists - `missing-content.ts` checks
 * that against the files.
 */
export type ContentRoute =
  /** A marketing document; no slugs is the home page. */
  | { kind: "marketing"; slugs: string[] }
  /** A legal document; no slugs is the legal index. */
  | { kind: "legal"; slugs: string[] }
  | { kind: "help" }
  | { kind: "help-category"; category: HelpCategory }
  /** Every glossary term, each a section of one page. */
  | { kind: "help-glossary" }
  /** A help article; no slugs is left to the route. */
  | { kind: "help-article"; slugs: string[] }
  | { kind: "author"; slug: string };

/** Any public page: content, or a page with none behind it (checkout, contact, upsell). */
export type PublicRoute = ContentRoute | { kind: "page" };

function matchHelp([kind, ...slugs]: readonly string[]): PublicRoute | null {
  if (kind === undefined) return { kind: "help" };
  if (kind === "article") return { kind: "help-article", slugs };
  if (kind === "glossary" && slugs.length === 0) {
    return { kind: "help-glossary" };
  }
  const [category] = slugs;
  if (kind === "category" && slugs.length === 1 && isHelpCategory(category)) {
    return { kind: "help-category", category };
  }
  return null;
}

/**
 * The public page a locale-less path names, or `null` when no route could
 * serve it. The one place the site's URL structure is spelled out: the
 * proxy's 404s, the Markdown served to agents and the sitemap all read it.
 */
export function matchPublicRoute(
  segments: readonly string[],
): PublicRoute | null {
  const [first, ...rest] = segments;

  switch (first) {
    case undefined:
      return { kind: "marketing", slugs: [] };
    case "legal":
      return { kind: "legal", slugs: rest };
    case "help":
      return matchHelp(rest);
    case "authors": {
      const [slug] = rest;
      return rest.length === 1 && slug ? { kind: "author", slug } : null;
    }
  }

  return ROUTED_SEGMENTS.has(first)
    ? { kind: "page" }
    : { kind: "marketing", slugs: [...segments] };
}

/** The locale-less path of a content route: `""` for the home page. */
export function publicPath(route: ContentRoute): string {
  const join = (slugs: string[]) =>
    slugs.length > 0 ? `/${slugs.join("/")}` : "";

  switch (route.kind) {
    case "marketing":
      return join(route.slugs);
    case "legal":
      return `/legal${join(route.slugs)}`;
    case "help":
      return "/help";
    case "help-category":
      return `/help/category/${route.category}`;
    case "help-glossary":
      return "/help/glossary";
    case "help-article":
      return `/help/article${join(route.slugs)}`;
    case "author":
      return `/authors/${route.slug}`;
  }
}

/** Whether a route has a Markdown form: every content route does. */
export function hasMarkdown(route: PublicRoute | null): route is ContentRoute {
  return route !== null && route.kind !== "page";
}
