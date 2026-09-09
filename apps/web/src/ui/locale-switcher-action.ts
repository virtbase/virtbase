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

"use server";

import { captureException } from "@sentry/nextjs";
import { COOKIE_DOMAIN } from "@virtbase/utils";
import { cookies, headers } from "next/headers";
import { hasLocale } from "next-intl";
import { COOKIE_MAX_AGE, COOKIE_NAME, locales } from "@/i18n/config";
import { auth } from "@/lib/auth/server";

/**
 * Records the language a signed-in customer picked.
 *
 * It writes and nothing more. The consoles read their locale from the segment
 * the proxy injected, which was decided before this action ran, so no amount of
 * revalidating here can change the page the caller is looking at - only a fresh
 * request through the proxy can, which is why the caller refreshes afterwards.
 *
 * It deliberately does not `revalidatePath`. The console tree is prerendered
 * per locale and those shells are shared, so invalidating the layout would
 * throw away every locale's shell for every user because one person switched
 * language.
 */
export async function updateLocaleAction(data: FormData) {
  const locale = data.get("locale");
  if ("string" !== typeof locale || !hasLocale(locales, locale)) {
    return;
  }

  const store = await cookies();
  store.set(COOKIE_NAME, locale, {
    domain: COOKIE_DOMAIN,
    // Without this the cookie is a session cookie, and an explicitly chosen
    // language would be forgotten when the browser closes - while the one
    // `ensureLocaleCookie` guesses from `accept-language` survives a year.
    maxAge: COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
  });

  // Awaited, not deferred: `resolveConsoleLocale` reads the stored preference
  // out of Better Auth's session cookie cache, and `updateUser` is what
  // re-issues that cache. Deferred, the refresh below would negotiate against
  // a cache still holding the old language.
  await updateDatabaseLocale(locale);
}

async function updateDatabaseLocale(locale: string) {
  try {
    await auth.api.updateUser({
      headers: await headers(),
      body: { locale },
    });
  } catch (error) {
    // A failed write costs the user their preference on the next device, not
    // this page: the cookie is already set.
    captureException(error);
  }
}
