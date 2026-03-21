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

import { captureException } from "@sentry/nextjs";
import { and, count, eq, gt, lt, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { serverPlans, servers } from "@virtbase/db/schema";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { verifySession } from "../verify-session";

export const getSalesByPlan = cache(async () => {
  "use cache: private";

  cacheLife("hours");
  cacheTag("admin", "admin-dashboard");

  await verifySession();

  try {
    const data = await db.transaction(
      async (tx) =>
        tx
          .select({
            name: serverPlans.name,
            count: count(),
          })
          .from(servers)
          .innerJoin(serverPlans, eq(servers.serverPlanId, serverPlans.id))
          .where(
            and(
              gt(servers.createdAt, sql`CURRENT_DATE - INTERVAL '1 month'`),
              lt(servers.createdAt, sql`CURRENT_DATE`),
            ),
          )
          .groupBy(serverPlans.name),
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );

    return data;
  } catch (error) {
    captureException(error);

    return [];
  }
});
