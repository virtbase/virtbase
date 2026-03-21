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
import { and, asc, count, eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { verifySession } from "../verify-session";

export const getCustomersOverTime = cache(async () => {
  "use cache: private";

  cacheLife("hours");
  cacheTag("admin", "admin-dashboard");

  await verifySession();

  try {
    const data = await db.transaction(
      async (tx) =>
        tx
          .select({
            date: sql<string>`TO_CHAR(dtx.date, 'YYYY/MM/DD')`,
            count: sql<number>`COALESCE(${count(users.id)}, 0)::INTEGER`,
          })
          .from(
            sql`(SELECT GENERATE_SERIES(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') AS date) AS dtx`,
          )
          .leftJoin(
            users,
            and(
              eq(users.role, "CUSTOMER"),
              sql`${users.createdAt}::DATE = dtx.date`,
            ),
          )
          .groupBy(sql`dtx.date`)
          .orderBy(asc(sql`dtx.date`))
          .limit(14),
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
