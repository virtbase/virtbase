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

import { Toaster } from "@virtbase/ui/sonner";
import { NextIntlClientProvider } from "next-intl";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Suspense } from "react";
import { defaultLocale } from "@/i18n/config";
import { TRPCReactProvider } from "@/lib/trpc/react";
import Document from "@/ui/document";

export default function Layout({ children }: LayoutProps<"/app.virtbase.com">) {
  return (
    <Document locale={defaultLocale}>
      <Suspense>
        <NextIntlClientProvider>
          <NuqsAdapter>
            <TRPCReactProvider>{children}</TRPCReactProvider>
          </NuqsAdapter>
        </NextIntlClientProvider>
      </Suspense>
      <Toaster className="pointer-events-auto" closeButton />
      {/* 
      // TODO: Re-add SentryReplayIntegration
      // <SentryReplayIntegration /> 
      */}
    </Document>
  );
}
