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

import { Button } from "@virtbase/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@virtbase/ui/empty";
import NextLink from "next/link";
import { getExtracted, getLocale } from "next-intl/server";
import Document from "@/ui/document";
import ColoredLayout from "@/ui/layout/colored-layout";
import { UserIndicator } from "@/ui/user-indicator";

export {
  defaultMetadata as metadata,
  defaultViewport as viewport,
} from "@/ui/document";

/**
 * The locale is read from the request, and the `lang` attribute it feeds sits
 * on `<html>` - the one element that cannot be moved inside a `<Suspense>`
 * boundary. So this route has no static shell to stream, and says so rather
 * than failing the build.
 *
 * This is the right trade only because it is a 404: nothing here is on a path
 * anyone waits for, and every route that actually matters still prerenders.
 */
export const instant = false;

/**
 * The 404 for requests that matched no route at all.
 *
 * There is no `[locale]` segment in scope here - this file sits outside every
 * root layout, which is what lets it own the `<html>` element - so
 * `next/root-params` has nothing to answer with and `i18n/request.ts` falls
 * back to the signed-in user's stored language, then the locale cookie. That
 * read is request-time, so unlike the rest of the tree this route is rendered
 * on demand. A 404 is the one page where that costs nothing.
 *
 * Paths under `(public)/[locale]` never reach this file: the proxy redirects
 * them into a locale first, so a bad marketing URL renders the prerendered,
 * locale-correct `[locale]/not-found.tsx` instead.
 */
export default async function NotFound() {
  const locale = await getLocale();
  const t = await getExtracted();

  return (
    <Document locale={locale}>
      <ColoredLayout>
        <div className="flex min-h-screen w-full flex-col items-center justify-between">
          <div className="grow basis-0">
            <div className="h-24" />
          </div>
          <div className="relative flex w-full flex-col items-center justify-center px-4">
            <Empty>
              <EmptyHeader>
                <EmptyTitle className="font-bold font-mono text-6xl">
                  404
                </EmptyTitle>
                <EmptyDescription className="text-lg">
                  {t("The requested page was not found.")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <NextLink href="/" prefetch={false}>
                    {t("Go to home")}
                  </NextLink>
                </Button>
              </EmptyContent>
            </Empty>
          </div>
          <div className="flex grow basis-0 flex-col justify-end">
            <UserIndicator />
          </div>
        </div>
      </ColoredLayout>
    </Document>
  );
}
