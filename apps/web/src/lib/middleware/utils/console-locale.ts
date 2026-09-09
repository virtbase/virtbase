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

import { getCookieCache } from "better-auth/cookies";
import type { NextRequest, NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import createMiddleware from "next-intl/middleware";
import { defaultLocale, locales } from "@/i18n/config";
import { consoleRouting } from "@/i18n/routing.console";

const negotiate = createMiddleware(consoleRouting);

/**
 * Which locale a console request should be rendered in.
 *
 * The consoles carry no locale in their address, so the proxy has to choose one
 * and inject it into the rewrite. Once it has, nothing downstream can revisit
 * the decision - the root layout reads the segment the proxy wrote - so every
 * source has to be consulted here, in order:
 *
 * 1. the signed-in user's stored `locale`, read from Better Auth's session
 *    cookie cache. This is the only place it can still be honoured, and
 *    without it a customer whose account says French but whose browser once
 *    picked up an English cookie would never see French again.
 * 2. whatever `next-intl` negotiates - the locale cookie first, then a best-fit
 *    match against `accept-language`. Deferring to its middleware rather than
 *    reading the cookie by hand is what gives somebody arriving on a new device
 *    their own language instead of English.
 *
 * No database is touched: the cookie cache is a signed cookie Better Auth
 * already maintains, and an absent or expired one simply falls through.
 */
export async function resolveConsoleLocale(req: NextRequest) {
  const negotiated = negotiate(req);

  // `next-intl` answers with a rewrite into the locale segment, or a redirect
  // when it wants to change the address; the locale it settled on is the first
  // segment of whichever it set.
  const resolved =
    negotiated.headers.get("x-middleware-rewrite") ??
    negotiated.headers.get("location");
  const [, segment] = new URL(resolved ?? req.url, req.url).pathname.split("/");
  const negotiatedLocale = hasLocale(locales, segment)
    ? segment
    : defaultLocale;

  const stored = (await getCookieCache(req.headers))?.user?.locale;

  return {
    locale: hasLocale(locales, stored) ? stored : negotiatedLocale,
    /** Applies the locale cookie `next-intl` decided to set, if any. */
    applyCookies(res: NextResponse) {
      for (const cookie of negotiated.cookies.getAll()) {
        res.cookies.set(cookie);
      }
      return res;
    },
  };
}
