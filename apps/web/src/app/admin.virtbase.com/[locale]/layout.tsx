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

import { constructMetadata } from "@virtbase/utils";
import { locales } from "@/i18n/config";
import ConsoleLayout from "@/ui/layout/console-layout";

export const metadata = constructMetadata({
  noIndex: true,
});

export { defaultViewport as viewport } from "@/ui/document";

/**
 * The admin console's root layout, and the reason its routes can be prerendered.
 *
 * `[locale]` here is a root param, so `getLocale()` inside the shell resolves
 * from the route rather than from the request. That one change is what takes
 * the whole tree off request-time rendering: nothing else under `admin.` reads
 * a cookie, a header or a session - the proxy gates access, and every page
 * fetches its data from the client over tRPC.
 *
 * The segment is never visible. `AdminMiddleware` injects it into the rewrite
 * and the browser keeps the unprefixed URL, which is `next-intl`'s
 * `localePrefix: "never"` arrangement: the locale is a property of the signed-in
 * user, not of the address, so there is nothing to put in the address bar and
 * no existing admin link to break.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function Layout({
  children,
}: LayoutProps<"/admin.virtbase.com/[locale]">) {
  return <ConsoleLayout>{children}</ConsoleLayout>;
}
