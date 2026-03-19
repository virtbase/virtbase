/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@virtbase/ui/breadcrumb";
import { LucideChevronRight } from "@virtbase/ui/icons";
import {
  constructMetadata,
  constructOpengraphUrl,
  PUBLIC_DOMAIN,
} from "@virtbase/utils";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "next-intl";
import { getExtracted, setRequestLocale } from "next-intl/server";
import { IntlLink } from "@/i18n/navigation.public";
import { helpArticles } from "@/lib/source";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;

  const t = await getExtracted({ locale });

  const title = t("Help Center");
  const description = t(
    "Find answers to all your Virtbase-related questions in one place with our comprehensive Help Center.",
  );

  return constructMetadata({
    title,
    description,
    canonicalUrl: `${PUBLIC_DOMAIN}/${locale}/help`,
    image: constructOpengraphUrl({
      title,
      subtitle: description,
      slug: `/${locale}/help`,
      theme: "dark",
    }),
  });
}

export default async function HelpPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  "use cache";

  cacheLife("max");
  cacheTag("help");

  const { locale } = await params;

  setRequestLocale(locale);

  const t = await getExtracted({
    locale,
  });

  const pages = helpArticles
    .getPages()
    .filter((page) => page.locale === locale);

  return (
    <main className="relative border-border border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-3 py-10">
        <h1 className="mb-2 font-medium text-foreground text-xl">
          {t("Help Center")}
        </h1>
        <Breadcrumb className="text-muted-foreground text-sm">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-muted-foreground">
                {t("All articles")}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-8 grid gap-2 rounded-md border border-border p-4">
          {pages.map((page) => (
            <IntlLink
              href={`/help/article/${page.slugs.join("/")}`}
              key={page.url}
              className="group flex items-center justify-between space-x-4 rounded-lg px-2 py-3 transition-colors hover:bg-accent/50 active:bg-accent/50 sm:px-4"
              prefetch={false}
            >
              <h3 className="font-medium text-foreground/80 text-sm sm:text-base">
                {page.data.title}
              </h3>
              <LucideChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-foreground"
              />
            </IntlLink>
          ))}
        </div>
      </div>
    </main>
  );
}
