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
 * Renders every legal page as a PDF into `public/<locale>/legal/<slug>.pdf`,
 * before `next build`. The PDFs are static files served by the CDN, so the
 * Typst compiler - a 50 MB native module - never runs in a function, and the
 * same file can be attached to an email.
 *
 *   bun run legal-pdfs
 *
 * A page is rendered from its own Markdown. A page whose frontmatter names a
 * `pdf` template, such as the supplier information, gets that document
 * instead: the page is the short text around the download.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PdfLanguage } from "@virtbase/pdf";
import { isPdfTemplate, renderDocument, renderTemplate } from "@virtbase/pdf";
import { defaultLocale, locales } from "../src/i18n/config.ts";

const CONTENT = fileURLToPath(
  new URL("../../../packages/content/legal/", import.meta.url),
);
const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));

/** The page's own "Last updated" wording, from the message catalogs. */
const LAST_UPDATED: Record<PdfLanguage, (date: string) => string> = {
  en: (date) => `Last updated: ${date}`,
  de: (date) => `Letzte Änderung: ${date}`,
  fr: (date) => `Dernière mise à jour : ${date}`,
  nl: (date) => `Laatst bijgewerkt: ${date}`,
};

interface Frontmatter {
  title: string;
  description?: string;
  lastModified?: string | Date;
  pdf?: string;
}

export interface LegalDocument {
  locale: PdfLanguage;
  slug: string;
  /** The file it is rendered from: the locale's own, or the source locale's. */
  file: string;
}

/**
 * Components that only lay a legal page out on the website and wrap plain
 * Markdown. In print they are dropped and their content kept; any other JSX
 * reaches the converter and fails the build.
 */
const LAYOUT_ONLY = /^[ \t]*<\/?(?:Steps|Step)>[ \t]*$/gm;

function parse(file: string): { frontmatter: Frontmatter; body: string } {
  const source = readFileSync(file, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source);
  if (!match?.[1]) throw new Error(`${file} has no frontmatter.`);

  return {
    frontmatter: Bun.YAML.parse(match[1]) as Frontmatter,
    body: (match[2] ?? "").replace(LAYOUT_ONLY, ""),
  };
}

/**
 * The date the page shows: the frontmatter's `lastModified` if set, else the
 * newest commit that touched the file - the rule the Fumadocs plugin follows
 * for the page itself.
 */
function lastModified(file: string, frontmatter: Frontmatter): Date {
  if (frontmatter.lastModified) return new Date(frontmatter.lastModified);

  try {
    const committed = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", file],
      { encoding: "utf8" },
    ).trim();
    if (committed) return new Date(committed);
  } catch {
    // Not a git checkout; fall through to today.
  }

  return new Date();
}

/**
 * Every page in every locale. A locale without its own file gets the source
 * locale's, as the page does, so every link on the site has a file behind it.
 */
export function listLegalDocuments(): LegalDocument[] {
  const slugs = readdirSync(join(CONTENT, defaultLocale))
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => name.slice(0, -".mdx".length));

  return locales.flatMap((locale) =>
    slugs.map((slug) => {
      const own = join(CONTENT, locale, `${slug}.mdx`);
      const file = existsSync(own)
        ? own
        : join(CONTENT, defaultLocale, `${slug}.mdx`);
      return { locale, slug, file };
    }),
  );
}

export function renderLegalDocument({ locale, file }: LegalDocument) {
  const { frontmatter, body } = parse(file);
  const lang: PdfLanguage = file.includes(`/${locale}/`)
    ? locale
    : defaultLocale;

  const modified = lastModified(file, frontmatter);
  const date = LAST_UPDATED[lang](
    new Intl.DateTimeFormat(lang, {
      dateStyle: "long",
      timeZone: "Europe/Berlin",
    }).format(modified),
  );

  if (frontmatter.pdf !== undefined) {
    if (!isPdfTemplate(frontmatter.pdf)) {
      throw new Error(`${file} names an unknown PDF "${frontmatter.pdf}".`);
    }
    return renderTemplate(frontmatter.pdf, {
      lang,
      date,
      createdAt: modified,
    });
  }

  return renderDocument({
    lang,
    title: frontmatter.title,
    ...(frontmatter.description ? { subject: frontmatter.description } : {}),
    date,
    body: { markdown: body },
    // The PDF only changes when the page does, so the CDN can keep it.
    createdAt: modified,
  });
}

function main() {
  const started = performance.now();
  const documents = listLegalDocuments();

  for (const locale of locales) {
    rmSync(join(PUBLIC, locale, "legal"), { recursive: true, force: true });
  }

  for (const document of documents) {
    const out = join(PUBLIC, document.locale, "legal", `${document.slug}.pdf`);
    try {
      mkdirSync(join(PUBLIC, document.locale, "legal"), { recursive: true });
      writeFileSync(out, renderLegalDocument(document));
    } catch (error) {
      throw new Error(
        `Rendering ${document.file} for /${document.locale} failed.`,
        { cause: error },
      );
    }
  }

  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`Rendered ${documents.length} legal PDFs in ${seconds} s.`);
}

if (import.meta.main) main();
