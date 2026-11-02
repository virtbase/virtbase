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

import { defineCollections, defineConfig } from "fumadocs-mdx/config";
import lastModifiedPlugin from "fumadocs-mdx/plugins/last-modified";
import * as z4 from "zod";
import { HELP_CATEGORIES } from "./src/lib/help-categories.ts";

const lastModified = z4.coerce.date().optional();

/**
 * Every document is also served as Markdown, to agents. `output: "function"`
 * keeps the authored Markdown and leaves MDX components as components, which
 * `ui/mdx/markdown-components.tsx` renders into Markdown of their own.
 */
const postprocess = {
  // Fumadocs would append `[#anchor]` to every heading, noise to an agent.
  includeProcessedMarkdown: { output: "function", headingIds: false },
} as const;

export const legalCollection = defineCollections({
  type: "doc",
  dir: "../../packages/content/legal",
  postprocess,
  schema: z4.object({
    title: z4.string(),
    description: z4.string(),
    lastModified,
  }),
});

export const helpArticleCollection = defineCollections({
  type: "doc",
  dir: "../../packages/content/help/articles",
  postprocess,
  schema: z4.object({
    title: z4.string(),
    description: z4.string(),
    categories: z4.array(z4.enum(HELP_CATEGORIES)).min(1),
    popular: z4.number().int().positive().optional(),
    authors: z4.array(z4.string()).min(1),
    related: z4.array(z4.string()).optional(),
    publishedAt: z4.coerce.date().optional(),
    keywords: z4.array(z4.string()),
    lastModified,
  }),
});

export const authorCollection = defineCollections({
  type: "doc",
  dir: "../../packages/content/authors",
  postprocess,
  schema: z4.object({
    name: z4.string(),
    role: z4.string().optional(),
    avatar: z4.string().startsWith("/").optional(),
    links: z4
      .object({
        github: z4.url().optional(),
        x: z4.url().optional(),
        website: z4.url().optional(),
      })
      .optional(),
    lastModified,
  }),
});

export const marketingCollection = defineCollections({
  type: "doc",
  dir: "../../packages/content/marketing",
  postprocess,
  schema: z4.object({
    /**
     * The `<title>` of the page. Not rendered — the visible heading is the
     * document's own `#` heading.
     */
    title: z4.string(),
    /** The meta description, and the OpenGraph subtitle. */
    description: z4.string(),
    keywords: z4.array(z4.string()).optional(),
    lastModified,
  }),
});

export default defineConfig({
  plugins: [lastModifiedPlugin()],
});
