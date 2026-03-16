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

import type { NextRequest } from "next/server";

export const parse = (req: NextRequest) => {
  let domain = req.headers.get("host") as string;
  // path is the path of the URL (e.g. virtbase.com/api/v1 -> /api/v1)
  const path = req.nextUrl.pathname;

  // remove www. from domain and convert to lowercase
  domain = domain.replace(/^www./, "").toLowerCase();

  // fullPath is the full URL path (along with search params)
  const searchParams = req.nextUrl.searchParams.toString();
  const searchParamsObj = Object.fromEntries(req.nextUrl.searchParams);
  const searchParamsString = searchParams.length > 0 ? `?${searchParams}` : "";
  const fullPath = `${path}${searchParamsString}`;

  // Here, we are using decodeURIComponent to handle foreign languages like Hebrew
  const key = decodeURIComponent(path.split("/")[1] || ""); // key is the first part of the path (e.g. virtbase.com/api/v1 -> api)
  const fullKey = decodeURIComponent(path.slice(1) || ""); // fullKey is the full path without the first slash (to account for multi-level subpaths, e.g. virtbase.com/api/v1 -> api/v1)

  return {
    domain,
    path,
    fullPath,
    key,
    fullKey,
    searchParamsObj,
    searchParamsString,
  };
};
