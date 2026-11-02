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

import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { defaultLocale } from "@/i18n/config.ts";
import { HELP_CATEGORIES } from "@/lib/help-categories.ts";

const ARTICLES = resolve(
  import.meta.dir,
  "../../../../../../packages/content/help/articles",
);

const AUTHORS = resolve(ARTICLES, "../../authors");

type Frontmatter = {
  categories: string[];
  popular?: number;
  authors: string[];
};

/** Every article's frontmatter, keyed by `<locale>/<slug>`. */
const articles = new Map<string, Frontmatter>();
for (const path of new Bun.Glob("*/*.mdx").scanSync({ cwd: ARTICLES })) {
  const source = await Bun.file(resolve(ARTICLES, path)).text();
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  articles.set(
    path.replace(/\.mdx$/, ""),
    Bun.YAML.parse(frontmatter) as Frontmatter,
  );
}

const source = [...articles].filter(([key]) =>
  key.startsWith(`${defaultLocale}/`),
);

test("a translation is filed exactly like its source", () => {
  const filing = ({ categories, popular, authors }: Frontmatter) => ({
    categories,
    popular,
    authors,
  });
  const drift = [...articles].flatMap(([key, frontmatter]) => {
    const original = articles.get(key.replace(/^[^/]+/, defaultLocale));
    if (!original) return [`${key} has no ${defaultLocale} source`];
    return Bun.deepEquals(filing(frontmatter), filing(original)) ? [] : [key];
  });

  expect(drift).toEqual([]);
});

test("every category has an article", () => {
  // The proxy accepts any known category slug, so an empty one would serve an
  // empty page instead of a 404.
  const used = new Set(source.flatMap(([, { categories }]) => categories));
  expect(HELP_CATEGORIES.filter((category) => !used.has(category))).toEqual([]);
});

test("every author an article names exists", () => {
  // Fumadocs validates each collection on its own, so a misspelt author would
  // otherwise just vanish from the byline.
  const known = new Set(
    [...new Bun.Glob(`${defaultLocale}/*.mdx`).scanSync({ cwd: AUTHORS })].map(
      (path) => path.replace(/^.*\/|\.mdx$/g, ""),
    ),
  );
  const unknown = source.flatMap(([key, { authors }]) =>
    authors.filter((author) => !known.has(author)).map((a) => `${key}: ${a}`),
  );
  expect(unknown).toEqual([]);
});

test("no two popular articles share a rank", () => {
  const ranks = source.flatMap(([, { popular }]) => popular ?? []);
  expect(new Set(ranks).size).toBe(ranks.length);
});
