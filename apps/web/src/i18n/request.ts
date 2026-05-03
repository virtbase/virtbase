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

import { captureException } from "@sentry/nextjs";
import { cookies, headers } from "next/headers";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cache } from "react";
import { auth } from "@/lib/auth/server";
import { COOKIE_NAME, defaultLocale, locales } from "./config";

const getUserLocale = cache(async () => {
  const store = await cookies();
  const cookieValue = store.get(COOKIE_NAME)?.value;

  if (cookieValue) {
    // Use the cookie value if it already exists (synced with the database)
    return cookieValue;
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (session && hasLocale(locales, session.user.locale)) {
      // User is authenticated and has a valid locale
      return session.user.locale;
    }
  } catch (error) {
    captureException(error);
  }

  // User is not authenticated
  // Fallback to the default locale
  return null;
});

export default getRequestConfig(
  async ({ locale: explicitLocale, requestLocale }) => {
    // `explicitLocale` is set when callers pass `{ locale }` to `getExtracted` /
    // `getTranslations` (e.g. Discord interactions). `requestLocale` reflects
    // the `[locale]` segment or middleware; do not call `rootParams.locale()`
    // before these — it throws in Route Handlers (unsupported `next/root-params`).
    let candidate: string | undefined = explicitLocale ?? (await requestLocale);

    if (!candidate) {
      try {
        candidate = await rootParams.locale();
      } catch {
        candidate = undefined;
      }
    }

    if (!candidate) {
      // App or admin domain: cookie and database locale
      candidate = (await getUserLocale()) ?? undefined;
    }

    const locale = hasLocale(locales, candidate) ? candidate : defaultLocale;
    return {
      locale,
      messages: (await import(`./messages/${locale}.po`)).default,
    };
  },
);
