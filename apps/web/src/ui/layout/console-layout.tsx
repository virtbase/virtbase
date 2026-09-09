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
import { getLocale } from "next-intl/server";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { TRPCReactProvider } from "@/lib/trpc/react";
import Document from "@/ui/document";
import SentryReplayIntegration from "@/ui/sentry-replay-integration";

/**
 * The shell both signed-in consoles render: `app.` and `admin.`.
 *
 * Shared as a component rather than by re-exporting one route's layout from
 * the other, so neither root owns the other's shell and it stops being tied to
 * either route's `LayoutProps`. Both consoles now sit under a `[locale]`
 * segment, so `getLocale()` resolves from the route for both - which is what
 * lets these trees be prerendered per language.
 */
export default async function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <Document locale={locale}>
      <NuqsAdapter>
        <TRPCReactProvider>
          <NextIntlClientProvider locale={locale}>
            {children}
          </NextIntlClientProvider>
          <Toaster className="pointer-events-auto" closeButton />
          <SentryReplayIntegration />
        </TRPCReactProvider>
      </NuqsAdapter>
    </Document>
  );
}
