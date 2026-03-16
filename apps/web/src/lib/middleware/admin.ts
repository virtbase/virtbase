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

import { isAdmin } from "@virtbase/auth/utils";
import { APP_DOMAIN } from "@virtbase/utils";
import { getCookieCache, getSessionCookie } from "better-auth/cookies";
import type { UserWithRole } from "better-auth/plugins";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parse } from "@/lib/middleware/utils/parse";

export async function AdminMiddleware(req: NextRequest) {
  const { path, fullPath, searchParamsObj } = parse(req);

  // Check if we have an exisiting session cookie
  const sessionCookie = getSessionCookie(req.headers);

  // if there's no session cookie and the path isn't /login, redirect to /login
  if (!sessionCookie && path !== "/login") {
    return NextResponse.redirect(
      new URL(
        `/login${path === "/" ? "" : `?next=${encodeURIComponent(fullPath)}`}`,
        req.url,
      ),
    );

    // if there's a session cookie
  } else if (sessionCookie) {
    // Cookie cache may be empty so we just use this as an additional check
    const sessionCookie = await getCookieCache(req.headers);
    if (sessionCookie && !isAdmin(sessionCookie.user as UserWithRole)) {
      if (!sessionCookie.session.impersonatedBy) {
        // throw 404 page
        return NextResponse.next();
      }

      // If the user is currently being impersonated, redirect to the app domain
      return NextResponse.redirect(APP_DOMAIN);
    }

    // if the path is /login, redirect to the dashboard
    if (path === "/login") {
      const next = searchParamsObj.next
        ? decodeURIComponent(searchParamsObj.next as string)
        : "/";
      return NextResponse.redirect(new URL(next, req.url));
    }
  }

  // otherwise, rewrite the path to /admin
  return NextResponse.rewrite(
    new URL(`/admin.virtbase.com${fullPath}`, req.url),
  );
}
