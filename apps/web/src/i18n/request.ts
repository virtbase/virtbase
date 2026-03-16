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

import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { COOKIE_NAME, defaultLocale, locales } from "./config";

export default getRequestConfig(async ({ requestLocale }) => {
  // Read from potential `[locale]` segment
  // if the user is on a public page
  let candidate = await requestLocale;

  if (!candidate) {
    // Read from cookie if the user is logged in
    // TODO: Use the user locale from session and store it in the database
    const store = await cookies();
    candidate = store.get(COOKIE_NAME)?.value;
  }

  const locale = hasLocale(locales, candidate) ? candidate : defaultLocale;
  return {
    locale,
    messages: (await import(`./messages/${locale}.po`)).default,
  };
});
