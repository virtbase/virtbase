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
  constructMetadata,
  constructOpengraphUrl,
  PUBLIC_DOMAIN,
} from "@virtbase/utils";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "next-intl";
import { getExtracted, setRequestLocale } from "next-intl/server";
import { AdvantagesRow } from "@/features/landing/components/advantages-row";
import { FeaturesShowcase } from "@/features/landing/components/features-showcase";
import { OperatingSystemShowcase } from "@/features/landing/components/operating-system-showcase";
import { BlockWrapper } from "@/ui/block-wrapper";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;

  const t = await getExtracted({
    locale,
  });

  const title = t("Virtbase - Hosting, but secure.");
  const description = t(
    "Virtbase is the provider for secure server hosting. Maximum performance with minimal effort.",
  );

  return constructMetadata({
    fullTitle: title,
    description,
    canonicalUrl: `${PUBLIC_DOMAIN}/${locale}`,
    image: constructOpengraphUrl({
      title,
      subtitle: description,
      slug: `/${locale}`,
      theme: "dark",
    }),
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  "use cache";

  cacheLife("max");
  cacheTag("home");

  const { locale } = await params;

  setRequestLocale(locale);

  const t = await getExtracted({
    locale,
  });

  return (
    <main>
      <BlockWrapper className="px-8 pt-16 pb-8" variant="hero">
        <div className="relative mx-auto text-center sm:max-w-lg">
          <h1 className="mt-5 text-balance text-center font-medium text-4xl text-foreground sm:text-5xl sm:leading-[1.15]">
            {t("Hosting, but secure.")}
          </h1>
          <p className="mt-4 text-pretty text-lg text-muted-foreground sm:text-xl">
            {t(
              "Virtbase is the provider for secure server hosting. Maximum performance with minimal effort.",
            )}
          </p>
        </div>
      </BlockWrapper>
      <BlockWrapper>
        <FeaturesShowcase locale={locale} />
      </BlockWrapper>
      <BlockWrapper>
        <AdvantagesRow locale={locale} />
      </BlockWrapper>
      <BlockWrapper>
        <OperatingSystemShowcase />
      </BlockWrapper>
    </main>
  );
}
