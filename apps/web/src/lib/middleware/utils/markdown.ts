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

/**
 * Routed segments whose pages are forms rather than content. They have no
 * Markdown form, so an agent asking for one gets the HTML page instead.
 */
const WITHOUT_MARKDOWN: ReadonlySet<string> = new Set([
  "checkout",
  "contact",
  "upsell",
]);

/** Whether a public page, by its locale-less path segments, has a Markdown form. */
export function hasMarkdown(segments: readonly string[]) {
  return !WITHOUT_MARKDOWN.has(segments[0] ?? "");
}

/** The internal route that renders a public page as Markdown. */
export function markdownPath(locale: string, segments: readonly string[]) {
  return `/llms.mdx/${[locale, ...segments].join("/")}`;
}
