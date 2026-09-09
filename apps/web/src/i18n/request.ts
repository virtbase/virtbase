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

import { cookies, headers } from "next/headers";
import * as rootParams from "next/root-params";
import type { Locale } from "next-intl";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cache } from "react";
// [!] `auth` is loaded inside `getStoredLocale` below, not imported here.
//
// This module is next-intl's request config, so next-intl loads it whenever
// something asks for a translator. `@/lib/auth/server` pulls in
// `@virtbase/api/integrations`, whose registry evaluates every integration
// package - and one of them, `@virtbase/integration-abuseipdb`, imports
// `getExtracted` from `next-intl/server` for its admin-console labels. That
// sends next-intl back here while this module is still initialising, and the
// half-built binding it finds throws `Cannot access '<binding>' before
// initialization` - failing every workflow step and, at build time, page-data
// collection for the whole route.
//
// Deferring the import breaks the cycle at the only edge that is not load
// bearing: nothing here needs `auth` until a request actually asks for a
// locale.
import { COOKIE_NAME, defaultLocale, locales } from "./config";

/**
 * The two ways `next/root-params` fails that are not our mistake.
 *
 * `E1014` is a Server Action and `E1043` a Route Handler. Neither is tied to a
 * single route - an action can be submitted from any page - so Next refuses to
 * guess which `[locale]` segment applies rather than returning a wrong one.
 *
 * Every other failure (a client component, `unstable_cache`, a call outside a
 * Server Component) means `next/root-params` was reached from somewhere it was
 * never meant to be. Those still fall through to the user's own locale, which
 * is a perfectly good answer, but they are reported rather than swallowed.
 *
 * The codes are internal to Next, so they are used only to decide whether to
 * report. If a future version renumbers them the worst case is noise in Sentry,
 * never a broken request.
 */
const ROUTELESS_ROOT_PARAM_CODES = new Set(["E1014", "E1043"]);

/**
 * The `[locale]` segment of the route being rendered, or `undefined` when the
 * URL cannot answer.
 *
 * Every route tree now carries a `[locale]` segment, so in practice this
 * answers for page renders and returns `undefined` only where a request is not
 * tied to one route - a Server Action or a Route Handler.
 */
async function getRouteLocale(): Promise<string | undefined> {
  try {
    return await rootParams.locale();
  } catch (error) {
    const code = (error as { __NEXT_ERROR_CODE?: string } | null)
      ?.__NEXT_ERROR_CODE;

    if (code && ROUTELESS_ROOT_PARAM_CODES.has(code)) {
      return undefined;
    }

    // Everything else belongs to the caller. Next signals a stalled fallback
    // shell by rejecting this promise with a `HangingPromiseRejectionError`,
    // which carries a `digest` but no error code - swallowing it would report
    // a phantom error and then bake a guessed locale into a shell that was
    // supposed to stall. Framework control flow travels the same way.
    throw error;
  }
}

/**
 * The language the user picked, for the routes that carry no locale in the URL.
 *
 * The stored preference is read before the cookie, because the cookie can be
 * older than the preference. The proxy stamps one from `accept-language` on the
 * first public page view, so a customer who reads the marketing site before
 * signing in arrives at the dashboard carrying a guess we made before we knew
 * who they were. `@/lib/auth/locale-cookie` keeps the cookie in step from the
 * moment they sign in, so the cookie is right far more often than not - it is
 * the ordering that decides who wins when it is not.
 *
 * The session lookup is cheap in the common case: Better Auth caches the
 * session in a signed cookie for five minutes, so most renders never reach the
 * database at all.
 */
const getStoredLocale = cache(async (): Promise<Locale | undefined> => {
  try {
    const { auth } = await import("@/lib/auth/server");
    const session = await auth.api.getSession({ headers: await headers() });

    if (session && hasLocale(locales, session.user.locale)) {
      return session.user.locale;
    }
  } catch {
    // An unreachable database must not cost a visitor their language, and must
    // never take a page down: fall through to the cookie. Deliberately not
    // reported - this runs on `global-not-found` too, which any bad URL
    // reaches, so a database outage would otherwise emit one event per 404.
  }

  const cookieValue = (await cookies()).get(COOKIE_NAME)?.value;

  return hasLocale(locales, cookieValue) ? cookieValue : undefined;
});

export default getRequestConfig(async ({ locale: explicitLocale }) => {
  const locale = await resolveLocale(explicitLocale);

  return {
    locale,
    messages: (await import(`./messages/${locale}.po`)).default,
  };
});

async function resolveLocale(explicitLocale: string | undefined) {
  // Set when a caller names the locale itself - a Discord interaction replying
  // in the member's language, an email rendered for its recipient. There is no
  // request to read it off, so it is the only answer available.
  if (explicitLocale) {
    return hasLocale(locales, explicitLocale) ? explicitLocale : defaultLocale;
  }

  const routeLocale = await getRouteLocale();

  if (routeLocale !== undefined) {
    // Inside `(public)/[locale]` the URL is the locale, for everyone. Honouring
    // a signed-in user's preference here instead would make `/en/pricing` mean
    // something different per visitor, which is the one thing a page that is
    // prerendered per locale and cached at the edge cannot do - and it would
    // contradict the `hreflang` and canonical map the page publishes about
    // itself.
    //
    // The proxy redirects an unprefixed entry point to the right locale before
    // a page ever renders, which is where the preference gets its say.
    // An unknown segment is rejected by `(public)/[locale]/layout.tsx`, not
    // here. Calling `notFound()` from the request config would re-enter it
    // while Next renders the 404 - `not-found.tsx` asks for a translator, which
    // lands back in this function with the same bad segment - and turn a 404
    // into a 500. Falling back keeps that render able to describe itself.
    return hasLocale(locales, routeLocale) ? routeLocale : defaultLocale;
  }

  return (await getStoredLocale()) ?? defaultLocale;
}
