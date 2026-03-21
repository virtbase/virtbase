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
import { and, eq, gt, isNotNull, isNull, lt, or, sql, sum } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { invoices, servers, users } from "@virtbase/db/schema";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { verifySession } from "../verify-session";

export const getActivityStats = cache(async () => {
  "use cache: private";

  cacheLife("hours");
  cacheTag("admin", "admin-dashboard");

  await verifySession();

  try {
    const result = await db.transaction(
      async (tx) =>
        Promise.all([
          tx.$count(
            users,
            and(
              or(eq(users.banned, false), isNull(users.banned)),
              eq(users.role, "CUSTOMER"),
            ),
          ),
          tx.$count(
            servers,
            or(
              gt(servers.terminatesAt, sql`now()`),
              isNull(servers.terminatesAt),
            ),
          ),
          tx
            .select({
              total: sum(invoices.total).as("total"),
            })
            .from(invoices)
            .where(
              and(
                isNotNull(invoices.paidAt),
                gt(invoices.paidAt, sql`(now() - interval '1 month')`),
                lt(invoices.paidAt, sql`now()`),
              ),
            )
            .then(([res]) => (res ? Number(res.total) / 100 : 0)),
        ]),
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );

    const [customersCount, activeServersCount, monthlyRevenue] = result;

    return {
      customersCount,
      activeServersCount,
      monthlyRevenue,
    };
  } catch (error) {
    captureException(error);

    return {
      customersCount: 0,
      activeServersCount: 0,
      monthlyRevenue: 0,
    };
  }
});
