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

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createTRPCContext } from "@virtbase/api";
import type { NextRequest } from "next/server";
import { env } from "@/env";
import { auth } from "@/lib/auth/server";

const handler = async (req: NextRequest) => {
  const rateLimitHeaders: Record<string, string> = {};

  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: (opts) =>
      createTRPCContext({
        ...opts,
        auth,
        headers: req.headers,
        setHeader: (k, v) => (rateLimitHeaders[k] = v),
      }),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
            );
          }
        : undefined,
  });

  const newHeaders = new Headers(response.headers);

  for (const [k, v] of Object.entries(rateLimitHeaders)) {
    newHeaders.set(k, v);
  }

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders,
  });
};

export { handler as GET, handler as POST };
