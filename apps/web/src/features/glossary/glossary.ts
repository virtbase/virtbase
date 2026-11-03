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

import type { Locale } from "next-intl";
import { getExtracted } from "next-intl/server";
import { defaultLocale } from "@/i18n/config.ts";
import { publicPath } from "@/lib/public-routes.ts";
import { glossary } from "@/lib/source.ts";

export type GlossaryTerm = ReturnType<typeof glossary.getPages>[number];

/** A term's id: its file name, the same in every language. */
export function getTermId(term: GlossaryTerm) {
  return term.slugs.join("/");
}

/** The locale-less link to a term's entry on the glossary page. */
export function getTermPath(id: string) {
  return `${publicPath({ kind: "help-glossary" })}#${id}`;
}

/** One term, in the locale or - when it has no translation - the source locale. */
export function getGlossaryTerm(id: string, locale: string) {
  return glossary.getPage([id], locale);
}

/**
 * Every term, in alphabetical order for the locale. A term that has not been
 * translated yet is listed in the source locale rather than left out, so a
 * link to it never lands on nothing.
 */
export function getGlossary(locale: string): GlossaryTerm[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base" });

  return glossary
    .getPages(defaultLocale)
    .flatMap((term) => getGlossaryTerm(getTermId(term), locale) ?? [])
    .sort((a, b) => collator.compare(a.data.title, b.data.title));
}

/** Title and description of the glossary page, for its metadata and Markdown. */
export async function getGlossaryText(locale: Locale) {
  const t = await getExtracted({ locale });

  return {
    title: t("Glossary"),
    description: t(
      "Short explanations of the technical terms used in the Virtbase Help Center, from PTR record to vCore.",
    ),
  };
}
