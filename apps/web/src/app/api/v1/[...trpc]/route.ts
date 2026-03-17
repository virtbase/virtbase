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

// TODO: Check if there is a better way to set the rate limit headers
const createContext = async ({
  req,
  res,
}: {
  req: Request;
  // `res` is not typed on `createOpenApiFetchHandler`
  // but it should exist
  res?: { setHeader: (key: string, value: string | string[]) => void };
}) => {
  return createTRPCContext({
    headers: req.headers,
    // `res` might be undefined, but `setHeader` is required
    // to set the rate limit headers on the response
    setHeader: res
      ? (name: string, value: string) => res.setHeader(name, value)
      : () => {},
    auth,
  });
};

const handler = (req: NextRequest) => {
  return createOpenApiFetchHandler({
    endpoint: "/api/v1",
    req,
    router: appRouter,
    createContext,
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
