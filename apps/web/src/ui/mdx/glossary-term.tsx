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

import { getExtracted, getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { getGlossaryTerm, getTermPath } from "@/features/glossary/glossary.ts";
import { GlossaryTermPopover } from "@/ui/mdx/glossary-term-popover.tsx";

/**
 * `<Term id="ptr-record">PTR record</Term>`: a term explained in the glossary,
 * shown with its definition on click. The text in between is what the article
 * says; the glossary supplies the rest, in the reader's language.
 */
export async function GlossaryTerm({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const locale = await getLocale();
  const term = getGlossaryTerm(id, locale);

  // A test fails for an unknown id; should one get through, the text still reads.
  if (!term) return children;

  const t = await getExtracted();

  return (
    <GlossaryTermPopover
      title={term.data.title}
      description={term.data.description}
      href={getTermPath(id)}
      linkLabel={t("Read more in the glossary")}
    >
      {children}
    </GlossaryTermPopover>
  );
}
