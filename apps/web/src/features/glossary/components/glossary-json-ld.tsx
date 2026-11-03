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

import type { DefinedTermSet, WithContext } from "schema-dts";
import type { GlossaryTerm } from "@/features/glossary/glossary.ts";
import { getTermId } from "@/features/glossary/glossary.ts";
import { ORGANIZATION_ID } from "@/ui/seo/default-json-ld.tsx";
import JsonLd from "@/ui/seo/json-ld.tsx";

/**
 * `DefinedTermSet` structured data for the glossary: every term with its
 * one-sentence definition and the address of its entry on the page.
 */
export function GlossaryJsonLd({
  url,
  locale,
  name,
  description,
  terms,
}: {
  /** Absolute URL of the glossary page. */
  url: string;
  locale: string;
  name: string;
  description: string;
  terms: GlossaryTerm[];
}) {
  const glossary: WithContext<DefinedTermSet> = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": url,
    url,
    name,
    description,
    inLanguage: locale,
    publisher: { "@id": ORGANIZATION_ID },
    hasDefinedTerm: terms.map((term) => ({
      "@type": "DefinedTerm",
      "@id": `${url}#${getTermId(term)}`,
      url: `${url}#${getTermId(term)}`,
      name: term.data.title,
      description: term.data.description,
      inDefinedTermSet: { "@id": url },
    })),
  };

  return <JsonLd schema={glossary} />;
}
