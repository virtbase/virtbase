/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { isAdmin } from "@virtbase/auth/utils";
import { APP_DOMAIN, getSafeRedirectUrl } from "@virtbase/utils";
import { getCookieCache, getSessionCookie } from "better-auth/cookies";
import type { UserWithRole } from "better-auth/plugins";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveConsoleLocale } from "@/lib/middleware/utils/console-locale";
import { rewriteToNotFound } from "@/lib/middleware/utils/not-found";
import { parse } from "@/lib/middleware/utils/parse";
import { readSession } from "@/lib/middleware/utils/read-session";

export async function AdminMiddleware(req: NextRequest) {
  const { path, fullPath, searchParamsObj, searchParamsString } = parse(req);

  // Check if we have an exisiting session cookie
  const sessionCookie = getSessionCookie(req.headers);

  // if there's no session cookie and the path isn't /login, redirect to /login
  if (!sessionCookie && path !== "/login" && path !== "/two-factor") {
    return NextResponse.redirect(
      new URL(
        `/login${path === "/" ? "" : `?next=${encodeURIComponent(fullPath)}`}`,
        req.url,
      ),
    );

    // if there's a session cookie
  } else if (sessionCookie) {
    // The cookie cache expires after a few minutes, so read the session when
    // it is gone rather than letting a customer through to the console
    const session =
      (await getCookieCache(req.headers)) ?? (await readSession(req.headers));
    if (session && !isAdmin(session.user as unknown as UserWithRole)) {
      if (!session.session.impersonatedBy) {
        // throw 404 page
        return rewriteToNotFound(req);
      }

      // If the user is currently being impersonated, redirect to the app domain
      return NextResponse.redirect(APP_DOMAIN);
    }

    // if the path is /login, redirect to the dashboard
    if (["/login", "/two-factor"].includes(path)) {
      const next = getSafeRedirectUrl(
        typeof searchParamsObj.next === "string"
          ? searchParamsObj.next
          : undefined,
      );
      return NextResponse.redirect(new URL(next, req.url));
    }
  }

  // otherwise, rewrite the path to /admin, under the locale segment its root
  // layout needs. The segment never reaches the browser - it exists so the
  // layout can read the locale from the route instead of from the request,
  // which is what lets the whole console be prerendered.
  const { locale, applyCookies } = await resolveConsoleLocale(req);

  return applyCookies(
    NextResponse.rewrite(
      new URL(
        `/admin.virtbase.com/${locale}${path === "/" ? searchParamsString : fullPath}`,
        req.url,
      ),
    ),
  );
}
