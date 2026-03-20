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

import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { locales } from "@/i18n/config";
import Document from "@/ui/document";
import { Footer } from "@/ui/footer";
import { Nav } from "@/ui/nav";
import { DefaultJsonLd } from "@/ui/seo/default-json-ld";

export {
  defaultMetadata as metadata,
  defaultViewport as viewport,
} from "@/ui/document";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
}: LayoutProps<"/[locale]">) {
  const locale = await getLocale();

  return (
    <Document locale={locale}>
      <NextIntlClientProvider locale={locale}>
        <NuqsAdapter>
          <Nav className="max-w-5xl" />
          {children}
          <Footer className="max-w-5xl border-0" />
        </NuqsAdapter>
      </NextIntlClientProvider>
      <DefaultJsonLd />
    </Document>
  );
}
