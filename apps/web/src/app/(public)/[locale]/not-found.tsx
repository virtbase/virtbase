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
import { getExtracted } from "next-intl/server";
import { IntlLink } from "@/i18n/navigation.public";

/**
 * The 404 for everything under `(public)/[locale]`.
 *
 * Sitting inside the `[locale]` root layout is the whole point: the segment is
 * in scope, so `next/root-params` answers, the page prerenders once per locale
 * alongside the rest of the tree, and the `lang` the layout puts on `<html>` is
 * the language this text is actually in.
 *
 * `global-not-found.tsx` handles the paths that match no route at all, where
 * there is no locale to read.
 */
export default async function NotFound() {
  const t = await getExtracted();

  return (
    <main className="flex w-full flex-col items-center justify-center px-4 py-24">
      <Empty>
        <EmptyHeader>
          <EmptyTitle className="font-bold font-mono text-6xl">404</EmptyTitle>
          <EmptyDescription className="text-lg">
            {t("The requested page was not found.")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <IntlLink href="/" prefetch={false}>
              {t("Go to home")}
            </IntlLink>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
