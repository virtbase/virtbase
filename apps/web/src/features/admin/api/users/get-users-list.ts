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
import { and, asc, count, desc, eq, ilike, inArray, or } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { users } from "@virtbase/db/schema";
import { getDateIntervalFilter } from "@virtbase/db/utils";
import { cacheLife, cacheTag } from "next/cache";
import type { GetUsersSchema } from "@/features/admin/lib/users/validations";
import { verifySession } from "../verify-session";

export async function getUsersList(input: GetUsersSchema) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("users");

  await verifySession();

  try {
    const offset = (input.page - 1) * input.perPage;

    const where = and(
      input.name
        ? or(
            ilike(users.name, `%${input.name}%`),
            ilike(users.email, `%${input.name}%`),
          )
        : undefined,
      input.role.length > 0 ? inArray(users.role, input.role) : undefined,
      input.emailVerified !== null
        ? eq(users.emailVerified, input.emailVerified)
        : undefined,
      getDateIntervalFilter(users.createdAt, input.createdAt),
    );

    const orderBy =
      input.sort.length > 0
        ? input.sort.map((item) =>
            item.desc ? desc(users[item.id]) : asc(users[item.id]),
          )
        : [asc(users.name)];

    const { data, total } = await db.transaction(
      async (tx) => {
        const data = await tx
          .select()
          .from(users)
          .limit(input.perPage)
          .offset(offset)
          .where(where)
          .orderBy(...orderBy);

        const total = await tx
          .select({
            count: count(),
          })
          .from(users)
          .where(where)
          .execute()
          .then((res) => res[0]?.count ?? 0);

        return { data, total };
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );

    const pageCount = Math.ceil(total / input.perPage);

    return { data, pageCount };
  } catch (error) {
    captureException(error);

    return { data: [], pageCount: 0 };
  }
}

export async function getUserRoleCounts(): Promise<{
  CUSTOMER: number;
  ADMIN: number;
}> {
  "use cache: private";

  cacheLife("hours");
  cacheTag("user-role-counts");

  await verifySession();

  try {
    return db.transaction(
      async (tx) => {
        return tx
          .select({
            role: users.role,
            count: count(),
          })
          .from(users)
          .groupBy(users.role)
          .then((res) =>
            res.reduce(
              (acc, { role, count }) => {
                acc[role as "CUSTOMER" | "ADMIN"] = count;
                return acc;
              },
              {
                CUSTOMER: 0,
                ADMIN: 0,
              },
            ),
          );
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );
  } catch (error) {
    captureException(error);

    return {
      CUSTOMER: 0,
      ADMIN: 0,
    };
  }
}

export async function getUserVerifiedCounts() {
  "use cache: private";

  cacheLife("hours");
  cacheTag("user-verified-counts");

  await verifySession();

  try {
    return db.transaction(
      async (tx) => {
        return tx
          .select({
            verified: users.emailVerified,
            count: count(),
          })
          .from(users)
          .groupBy(users.emailVerified)
          .then((res) =>
            res.reduce(
              (acc, { verified, count }) => {
                acc[verified ? "true" : "false"] = count;
                return acc;
              },
              {
                true: 0,
                false: 0,
              },
            ),
          );
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );
  } catch (error) {
    captureException(error);

    return {
      true: 0,
      false: 0,
    };
  }
}

export type GetUsersListOutput = Awaited<ReturnType<typeof getUsersList>>;
