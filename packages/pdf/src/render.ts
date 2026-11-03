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

import type { Inputs } from "./compiler.ts";
import { compile } from "./compiler.ts";
import { markdownToTree } from "./markdown.ts";

/** The languages the layouts have texts and company data for. */
export type PdfLanguage = "de" | "en" | "fr" | "nl";

/**
 * What goes below the title.
 *
 * `markdown` is GitHub-flavoured Markdown and is never read as Typst, so it
 * is safe for any text. `typst` is Typst markup, evaluated with every element
 * of `typst/lib/virtbase.typ` in scope - for content Markdown cannot express,
 * such as an invoice's totals. It is code: never put untrusted text in it.
 */
export type PdfBody = { markdown: string } | { typst: string };

interface CommonOptions {
  lang: PdfLanguage;
  /** Set as the page title and, prefixed with "Virtbase – ", the PDF title. */
  title: string;
  /** The PDF's description metadata. */
  subject?: string;
  keywords?: string[];
  body: PdfBody;
  /**
   * The creation date written into the PDF. Pass a fixed one for output that
   * is byte-for-byte reproducible; it defaults to now.
   */
  createdAt?: Date;
}

export interface DocumentOptions extends CommonOptions {
  /** A small line under the title, e.g. "Stand: 3. November 2026". */
  date?: string;
}

export interface LetterOptions extends CommonOptions {
  /** The address block, one line each. */
  recipient: string[];
  /** The info block beside the address: label and value. */
  info?: [label: string, value: string][];
}

function body(content: PdfBody, inputs: Inputs): string {
  if ("typst" in content) return content.typst;
  inputs["body.json"] = markdownToTree(content.markdown);
  return '#render-markdown(json("/input/body.json"))';
}

/**
 * Everything but the body goes in as JSON, not as source, so a title with a
 * `"` or a `#` in it cannot end up evaluated.
 */
function source(layout: string, content: string): string {
  return [
    '#import "/lib/virtbase.typ": *',
    '#import "/lib/markdown.typ": render-markdown',
    `#show: ${layout}.with(..json("/input/options.json"))`,
    content,
  ].join("\n");
}

function render(
  layout: "vb-document" | "vb-letter",
  options: Record<string, unknown>,
  { body: content, createdAt }: CommonOptions,
): Uint8Array {
  const inputs: Inputs = { "options.json": options };
  const main = source(layout, body(content, inputs));
  return compile(main, { inputs, createdAt }).pdf;
}

/** A document: title and body on the letterhead, without an address block. */
export function renderDocument(options: DocumentOptions): Uint8Array {
  const { lang, title, subject, keywords, date } = options;
  return render(
    "vb-document",
    {
      lang,
      title,
      subject: subject ?? null,
      keywords: keywords ?? [],
      date: date ?? null,
    },
    options,
  );
}

/** A letter: address block, info block and fold marks on the first page. */
export function renderLetter(options: LetterOptions): Uint8Array {
  const { lang, title, subject, keywords, recipient, info } = options;
  return render(
    "vb-letter",
    {
      lang,
      title,
      subject: subject ?? null,
      keywords: keywords ?? [],
      recipient,
      info: info ?? [],
    },
    options,
  );
}

/**
 * Documents that exist only as PDF. Each is a Typst file of its own in
 * `typst/documents/<name>/<name>.typ`, reading its wording from a `data.yaml`
 * beside it and every company value from `typst/data/company.yaml`.
 */
export const PDF_TEMPLATES = ["supplier-information"] as const;

export type PdfTemplate = (typeof PDF_TEMPLATES)[number];

export function isPdfTemplate(name: string): name is PdfTemplate {
  return (PDF_TEMPLATES as readonly string[]).includes(name);
}

export interface TemplateOptions {
  lang: PdfLanguage;
  /** A small line under the title, e.g. "Stand: 3. November 2026". */
  date?: string;
  createdAt?: Date;
}

/** Renders one of {@link PDF_TEMPLATES}. */
export function renderTemplate(
  template: PdfTemplate,
  { lang, date, createdAt }: TemplateOptions,
): Uint8Array {
  return compile(
    { path: `documents/${template}/${template}.typ` },
    { sysInputs: { lang, ...(date ? { date } : {}) }, createdAt },
  ).pdf;
}
