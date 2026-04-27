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
import type { NextRequest, NextResponse } from "next/server";
import { COOKIE_MAX_AGE, COOKIE_NAME } from "@/i18n/config";

export function ensureLocaleCookie(
  request: NextRequest,
  response: NextResponse,
  locale: string,
) {
  const hasCookie =
    request.cookies.has(COOKIE_NAME) || response.cookies.has(COOKIE_NAME);

  if (hasCookie) return;

  response.cookies.set(COOKIE_NAME, locale, {
    domain: COOKIE_DOMAIN,
    maxAge: COOKIE_MAX_AGE,
  });
}
