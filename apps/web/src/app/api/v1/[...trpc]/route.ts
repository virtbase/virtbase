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

import {
  appRouter,
  createOpenApiFetchHandler,
  createTRPCContext,
} from "@virtbase/api";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

const handler = async (req: NextRequest) => {
  const rateLimitHeaders: Record<string, string> = {};

  const response = await createOpenApiFetchHandler({
    endpoint: "/api/v1",
    req,
    router: appRouter,
    createContext: () =>
      createTRPCContext({
        auth,
        headers: req.headers,
        setHeader: (k, v) => (rateLimitHeaders[k] = v),
      }),
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

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
  handler as HEAD,
};
