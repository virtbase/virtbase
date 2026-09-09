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

import { COOKIE_DOMAIN } from "@virtbase/utils";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { getSessionCookie } from "better-auth/cookies";
import { hasLocale } from "next-intl";
import { COOKIE_MAX_AGE, COOKIE_NAME, locales } from "@/i18n/config";

/**
 * Stamps the signed-in user's stored language onto the locale cookie.
 *
 * The public site reads its locale off the URL, so the only say a preference
 * gets there is the redirect the proxy performs for an unprefixed entry point -
 * and the proxy decides that from the cookie, long before anything has looked
 * at a session. Left alone, the cookie is whatever `ensureLocaleCookie` guessed
 * from `accept-language` on the visitor's very first page view, which for
 * someone who reads the marketing site before signing in is a guess made
 * before we knew who they were. It would then outlive the sign-in by a year.
 *
 * Signing in is the moment that guess can be replaced with the real answer, so
 * that is where it is replaced. The proxy, `next-intl`'s routing and the
 * dashboard all read the same cookie, so one write settles every surface.
 *
 * Must be registered *before* `nextCookies()`, which is what copies the
 * `set-cookie` headers accumulated here onto the Next.js response.
 */
export const localeCookiePlugin = {
  id: "virtbase-locale-cookie",
  hooks: {
    after: [
      {
        /**
         * Better Auth sets `newSession` on every dispatch that issues a session
         * cookie, which is more than just signing in - a session refresh and
         * `updateUser` do it too. Stamping on those would be wrong: a signed-in
         * visitor who switches language on the public site has their choice
         * written to the cookie by `next-intl`, and the next background refresh
         * would quietly put it back.
         *
         * A request arriving without a session cookie is the one that is
         * actually signing in, so that is the one that gets to write. It covers
         * password, OAuth callback and two-factor alike without naming a single
         * endpoint, and if it ever misses one the result is the old behaviour
         * rather than a wrong language.
         */
        matcher: (ctx) =>
          ctx.context.newSession != null &&
          ctx.headers != null &&
          !getSessionCookie(ctx.headers),
        handler: createAuthMiddleware(async (ctx) => {
          const locale = ctx.context.newSession?.user.locale;

          // A user who never chose a language has no preference to apply, so
          // whatever was negotiated for them stands.
          if (!hasLocale(locales, locale)) return;

          ctx.setCookie(COOKIE_NAME, locale, {
            domain: COOKIE_DOMAIN,
            maxAge: COOKIE_MAX_AGE,
            path: "/",
            sameSite: "lax",
          });
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;
