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

import { ADMIN_HOSTNAMES, API_HOSTNAMES, APP_HOSTNAMES } from "@virtbase/utils";
import type { NextRequest, ProxyConfig } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing.public";
import { AdminMiddleware } from "@/lib/middleware/admin";
import { ApiMiddleware } from "@/lib/middleware/api";
import { AppMiddleware } from "@/lib/middleware/app";
import { parse } from "@/lib/middleware/utils/parse";
import { ensureLocaleCookie } from "./lib/middleware/ensure-locale-cookie";

export const config: ProxyConfig = {
  // Match all pathnames except for
  // - … if they start with `/api`, `/_next`, `/_vercel`, `/_proxy` or `/.well-known/workflow/`
  // - … or if they start with `/science` (Sentry tunnel)
  // - … or if they are the geofeed.csv file route
  // - … the ones containing a dot (e.g. `favicon.ico`)
  matcher:
    "/((?!api|_next|_vercel|_proxy|\\.well-known/workflow/|science|geofeed\\.csv|.*\\..*).*)",
};

const intlMiddleware = createMiddleware(routing);

export default async function proxy(req: NextRequest) {
  const { domain } = parse(req);

  if (APP_HOSTNAMES.has(domain)) {
    return AppMiddleware(req);
  }

  if (API_HOSTNAMES.has(domain)) {
    return ApiMiddleware(req);
  }

  if (ADMIN_HOSTNAMES.has(domain)) {
    return AdminMiddleware(req);
  }

  // for public pages
  const res = intlMiddleware(req);

  // Ensure that the locale cookie is set the first time the user visits the
  // site, so the locale carries over to the app and admin pages, which have no
  // locale in the URL to read one from.
  //
  // `next-intl` writes the cookie itself when it has something to correct, but
  // deliberately stays quiet when a first-time visitor's `accept-language`
  // already agrees with the locale it picked - the common case for an English
  // browser landing on `/`. That is exactly the visit this needs to catch.
  //
  // The resolved locale lives in whichever header `intlMiddleware` set: a
  // request without a locale prefix is answered with a redirect, one that has a
  // prefix with a rewrite, and an already-canonical request with neither.
  const resolved =
    res.headers.get("x-middleware-rewrite") ?? res.headers.get("location");
  const [, localeSegment] = new URL(
    resolved ?? req.url,
    req.url,
  ).pathname.split("/");

  ensureLocaleCookie(req, res, localeSegment);
  return res;
}
