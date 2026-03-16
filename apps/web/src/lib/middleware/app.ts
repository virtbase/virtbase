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

import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { parse } from "@/lib/middleware/utils/parse";

export async function AppMiddleware(req: NextRequest) {
  const { path, fullPath, searchParamsObj } = parse(req);

  // Check if we have an exisiting session cookie
  const sessionCookie = getSessionCookie(req.headers);

  // if there's no session cookie and the path isn't /login or /register, redirect to /login
  if (
    !sessionCookie &&
    path !== "/login" &&
    path !== "/forgot-password" &&
    path !== "/register" &&
    !path.startsWith("/reset-password")
  ) {
    return NextResponse.redirect(
      new URL(
        `/login${path === "/" ? "" : `?next=${encodeURIComponent(fullPath)}`}`,
        req.url,
      ),
    );

    // if there's a session cookie
  } else if (sessionCookie) {
    // if the path is /login or /register, redirect to the dashboard
    if (["/login", "/register"].includes(path)) {
      const next = searchParamsObj.next
        ? decodeURIComponent(searchParamsObj.next as string)
        : "/";
      return NextResponse.redirect(new URL(next, req.url));
    }
  }

  // otherwise, rewrite the path to /app
  return NextResponse.rewrite(new URL(`/app.virtbase.com${fullPath}`, req.url));
}
