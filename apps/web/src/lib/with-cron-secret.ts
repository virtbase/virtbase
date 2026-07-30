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

import { safeSecretCompare } from "@virtbase/utils";
import type { NextRequest } from "next/server";
import { env } from "@/env";

export function withCronSecret(
  handler: (request: NextRequest) => Promise<Response>,
) {
  return async (request: NextRequest) => {
    if (!env.CRON_SECRET) {
      return new Response("Cron secret is not configured", {
        status: 500,
      });
    }

    const authHeader = request.headers.get("authorization");
    const expected = `Bearer ${env.CRON_SECRET}`;
    if (!safeSecretCompare(authHeader, expected)) {
      return new Response("Unauthorized", {
        status: 401,
      });
    }

    return handler(request);
  };
}
