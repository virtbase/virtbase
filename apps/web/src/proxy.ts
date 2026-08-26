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
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing.public";
import { AdminMiddleware } from "@/lib/middleware/admin";
import { ApiMiddleware } from "@/lib/middleware/api";
import { AppMiddleware } from "@/lib/middleware/app";
import { parse } from "@/lib/middleware/utils/parse";
import { defaultLocale } from "./i18n/config";
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
  const { domain, path, searchParamsString } = parse(req);

  if (APP_HOSTNAMES.has(domain)) {
    return AppMiddleware(req);
  }

  if (API_HOSTNAMES.has(domain)) {
    return ApiMiddleware(req);
  }

  if (ADMIN_HOSTNAMES.has(domain)) {
    return AdminMiddleware(req);
  }

  // The bare root is the most-linked URL on the domain, and next-intl answers
  // it with a 307 whose target follows `Accept-Language` — four possible
  // targets, no `Vary` header. Both halves of that hurt: a *temporary*
  // redirect tells a crawler to keep `/` indexed as a URL in its own right
  // rather than fold it into the locale it points at, and a target that
  // changes per request leaves it nothing consistent to fold into. The result
  // is a home page competing with itself, with `/` ranking well below the very
  // URLs it redirects to.
  //
  // Answer it here instead, with one permanent redirect to the `x-default`
  // locale — the same URL `constructAlternateLanguages()` advertises. Which
  // locale a *searcher* lands on stays hreflang's job, which is the only
  // mechanism that treats all four locales equally. The target must not vary:
  // browsers cache a 308 indefinitely, so a negotiated one would pin the first
  // locale a visitor ever resolved.
  if (path === "/") {
    return NextResponse.redirect(
      new URL(`/${defaultLocale}${searchParamsString}`, req.url),
      308,
    );
  }

  // for public pages
  const res = intlMiddleware(req);

  // Ensure that the locale cookie is set the first time the user visits the site
  // This will allow syncing the locale between the public and private pages
  const [, locale = defaultLocale] = new URL(
    res.headers.get("x-middleware-rewrite") || req.url,
  ).pathname.split("/");

  ensureLocaleCookie(req, res, locale);
  return res;
}
