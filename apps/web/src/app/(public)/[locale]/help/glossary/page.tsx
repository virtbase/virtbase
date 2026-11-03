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

import {
  constructMetadata,
  constructOpengraphUrl,
  PUBLIC_DOMAIN,
} from "@virtbase/utils";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getLocale } from "next-intl/server";
import { GlossaryJsonLd } from "@/features/glossary/components/glossary-json-ld.tsx";
import {
  getGlossary,
  getGlossaryText,
  getTermId,
} from "@/features/glossary/glossary.ts";
import { HelpBreadcrumb } from "@/features/help/components/help-breadcrumb.tsx";
import { HelpHeader } from "@/features/help/components/help-header.tsx";
import { locales } from "@/i18n/config.ts";
import { constructAlternateLanguages } from "@/lib/hreflang.ts";
import { markdownUrl } from "@/lib/markdown-url.ts";
import { publicPath } from "@/lib/public-routes.ts";
import { helpMdxComponents } from "@/ui/mdx/article-components.tsx";
import { Prose } from "@/ui/prose.tsx";

const path = publicPath({ kind: "help-glossary" });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/help/glossary">): Promise<Metadata> {
  "use cache";

  const { locale } = await params;

  cacheLife("max");
  cacheTag("home", locale);

  const { title, description } = await getGlossaryText(await getLocale());

  return constructMetadata({
    title,
    description,
    canonicalUrl: `${PUBLIC_DOMAIN}/${locale}${path}`,
    languages: constructAlternateLanguages(path),
    markdownUrl: markdownUrl(locale, path),
    image: constructOpengraphUrl({
      title,
      slug: `/${locale}${path}`,
      theme: "dark",
    }),
  });
}

export default async function GlossaryPage() {
  "use cache";

  const locale = await getLocale();

  cacheLife("max");
  cacheTag("home", locale);

  const { title, description } = await getGlossaryText(locale);
  const terms = getGlossary(locale);

  return (
    <>
      <HelpHeader />
      <main className="relative border-border border-t">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-4 gap-10 px-3 py-10 lg:px-4 xl:px-0">
          <div className="col-span-4 flex flex-col space-y-8 sm:col-span-3 sm:pr-10">
            <HelpBreadcrumb title={title} />
            <div className="flex flex-col space-y-4">
              <h1 className="font-medium text-3xl leading-snug sm:text-4xl">
                {title}
              </h1>
              <p className="text-muted-foreground">{description}</p>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {terms.map((term) => {
                const Body = term.data.body;
                return (
                  <section
                    key={getTermId(term)}
                    id={getTermId(term)}
                    className="scroll-mt-20 py-6 first:pt-0"
                  >
                    <h2 className="font-medium text-foreground text-xl">
                      {term.data.title}
                    </h2>
                    <p className="mt-2 font-medium text-foreground/90">
                      {term.data.description}
                    </p>
                    <Prose className="mt-2">
                      <Body components={helpMdxComponents} />
                    </Prose>
                  </section>
                );
              })}
            </div>
          </div>
          <nav
            aria-label={title}
            className="sticky top-20 col-span-1 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto sm:block"
          >
            <ul className="flex flex-col gap-1.5 text-sm">
              {terms.map((term) => (
                <li key={getTermId(term)}>
                  <a
                    href={`#${getTermId(term)}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {term.data.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </main>
      <GlossaryJsonLd
        url={`${PUBLIC_DOMAIN}/${locale}${path}`}
        locale={locale}
        name={title}
        description={description}
        terms={terms}
      />
    </>
  );
}
