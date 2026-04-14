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

import * as Sentry from "@sentry/nextjs";
import { asc } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { datacenters } from "@virtbase/db/schema";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { verifySession } from "../verify-session";

export const getLinkableDatacenters = cache(async () => {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("datacenters");

  await verifySession();

  try {
    return db.transaction(
      async (tx) => {
        return tx
          .select({
            id: datacenters.id,
            name: datacenters.name,
            country: datacenters.country,
          })
          .from(datacenters)
          .orderBy(asc(datacenters.name));
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );
  } catch (error) {
    Sentry.captureException(error);

    return [];
  }
});
