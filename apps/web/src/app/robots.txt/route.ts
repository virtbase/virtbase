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

/**
 * Cloudflare's Content Signals Policy, verbatim (CC0). It defines the
 * vocabulary of the `Content-Signal` line below, and makes a `no` an express
 * reservation of rights under Art. 4 of the EU DSM Directive.
 *
 * @see https://contentsignals.org
 * @see https://datatracker.ietf.org/doc/draft-romm-aipref-contentsignals/
 */
const CONTENT_SIGNALS_POLICY = `# As a condition of accessing this website, you agree to
# abide by the following content signals:

# (a)  If a content-signal = yes, you may collect content
# for the corresponding use.
# (b)  If a content-signal = no, you may not collect content
# for the corresponding use.
# (c)  If the website operator does not include a content
# signal for a corresponding use, the website operator
# neither grants nor restricts permission via content signal
# with respect to the corresponding use.

# The content signals and their meanings are:

# search: building a search index and providing search
# results (e.g., returning hyperlinks and short excerpts
# from your website's contents).  Search does not include
# providing AI-generated search summaries.
# ai-input: inputting content into one or more AI models
# (e.g., retrieval augmented generation, grounding, or other
# real-time taking of content for generative AI search
# answers).
# ai-train: training or fine-tuning AI models.

# ANY RESTRICTIONS EXPRESSED VIA CONTENT SIGNALS ARE EXPRESS
# RESERVATIONS OF RIGHTS UNDER ARTICLE 4 OF THE EUROPEAN
# UNION DIRECTIVE 2019/790 ON COPYRIGHT AND RELATED RIGHTS
# IN THE DIGITAL SINGLE MARKET.`;

/**
 * Found in search and in AI answers, but not trained on.
 */
const CONTENT_SIGNAL = "search=yes, ai-input=yes, ai-train=no";

/**
 * Crawlers that collect for training only. The signal says `ai-train=no` to
 * everyone; these are kept out outright, because a `Disallow` is what they
 * document honouring. Each vendor's search and user-initiated fetchers -
 * `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User` - are
 * separate agents and fall under `*`.
 *
 * `Google-Extended` is deliberately absent: it also governs grounding in
 * Gemini, which is `ai-input`.
 */
const TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Applebot-Extended",
  "Meta-ExternalAgent",
];

/** Must match the path of the "Honeypot" rule in the Vercel firewall. */
const HONEYPOT_DISALLOW = "Disallow: /api/internal/config-export";

async function getRobots() {
  "use cache";

  cacheTag("robots.txt");
  cacheLife("max");

  return [
    CONTENT_SIGNALS_POLICY,
    [
      "User-agent: *",
      `Content-Signal: ${CONTENT_SIGNAL}`,
      "Allow: /",
      "Allow: /api/docs",
      "Allow: /api/openapi.json",
      "Disallow: /api",
      "Disallow: /api/",
      // A honeypot: the path does not exist and nothing links to it, so only
      // a client reading this list for targets requests it. The firewall's
      // "Honeypot" rule catches it.
      HONEYPOT_DISALLOW,
      "Disallow: */checkout",
      "Disallow: */checkout/",
      "Disallow: */upsell",
      "Disallow: */upsell/",
    ].join("\n"),
    [
      ...TRAINING_CRAWLERS.map((agent) => `User-agent: ${agent}`),
      "Disallow: /",
    ].join("\n"),
    ["User-agent: nsa", "Disallow: /"].join("\n"),
    `Sitemap: ${PUBLIC_DOMAIN}/sitemap.xml`,
  ].join("\n\n");
}

/**
 * A route handler rather than `app/robots.ts`: Next's `MetadataRoute.Robots`
 * only knows `Allow`, `Disallow` and `Crawl-delay`, and drops anything else -
 * `Content-Signal` included.
 */
export async function GET() {
  return new Response(`${await getRobots()}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
