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

import { PUBLIC_DOMAIN } from "@virtbase/utils";
import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";

export default async function robots(): Promise<MetadataRoute.Robots> {
  "use cache";

  cacheTag("robots.txt");
  cacheLife("max");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/docs"],
        disallow: ["/api", "/api/", "*/checkout", "*/checkout/"],
      },
      {
        userAgent: "nsa",
        disallow: "/",
      },
    ],
    sitemap: `${PUBLIC_DOMAIN}/sitemap.xml`,
  };
}
