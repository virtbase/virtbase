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
import { caseReference } from "@virtbase/api/abuse";
import { and, asc, count, desc, eq, inArray, or, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { abuseCaseServers, abuseCases, users } from "@virtbase/db/schema";
import { escapedIlike, getDateIntervalFilter } from "@virtbase/db/utils";
import { cacheLife, cacheTag } from "next/cache";
import type { GetAbuseCasesSchema } from "../../lib/abuse/validations";
import { verifySession } from "../verify-session";

type CaseStatus = (typeof abuseCases.$inferSelect)["status"];
type CaseSeverity = (typeof abuseCases.$inferSelect)["severity"];
type CaseCategory = (typeof abuseCases.$inferSelect)["category"];

/**
 * The reference an operator types, e.g. `AB-1042` or just `1042`.
 *
 * Parsed rather than matched as text: `number` is an integer column, and
 * `ILIKE` on it would need a cast that no index can serve.
 */
const referenceNumber = (value: string): number | null => {
  const digits = value.trim().replace(/^ab-?/i, "");
  if (!/^\d+$/.test(digits)) return null;

  const parsed = Number.parseInt(digits, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export async function getAbuseCasesList(input: GetAbuseCasesSchema) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("abuse-cases");

  await verifySession();

  try {
    const offset = (input.page - 1) * input.perPage;
    const reference = input.title ? referenceNumber(input.title) : null;

    const where = and(
      input.title
        ? or(
            escapedIlike(abuseCases.title, input.title),
            escapedIlike(users.email, input.title),
            reference === null ? undefined : eq(abuseCases.number, reference),
          )
        : undefined,
      input.status.length > 0
        ? inArray(abuseCases.status, input.status as CaseStatus[])
        : undefined,
      input.severity.length > 0
        ? inArray(abuseCases.severity, input.severity as CaseSeverity[])
        : undefined,
      input.category.length > 0
        ? inArray(abuseCases.category, input.category as CaseCategory[])
        : undefined,
      getDateIntervalFilter(abuseCases.createdAt, input.createdAt),
    );

    const orderBy =
      input.sort.length > 0
        ? input.sort.map((item) =>
            item.desc ? desc(abuseCases[item.id]) : asc(abuseCases[item.id]),
          )
        : [desc(abuseCases.createdAt)];

    const { data, total } = await db.transaction(
      async (tx) => {
        const data = await tx
          .select({
            id: abuseCases.id,
            number: abuseCases.number,
            title: abuseCases.title,
            category: abuseCases.category,
            severity: abuseCases.severity,
            status: abuseCases.status,
            enforcement: abuseCases.enforcement,
            staleAttribution: abuseCases.staleAttribution,
            blocksOrdering: abuseCases.blocksOrdering,
            respondBy: abuseCases.respondBy,
            createdAt: abuseCases.createdAt,
            updatedAt: abuseCases.updatedAt,
            // Left-joined: a case that arrived by email has no customer until
            // somebody reads it, and hiding those would hide exactly the ones
            // that most need a human.
            user: {
              id: users.id,
              name: users.name,
              email: users.email,
              image: users.image,
            },
            serverCount: sql<number>`(
              SELECT COUNT(*) FROM ${abuseCaseServers}
              WHERE ${abuseCaseServers.caseId} = ${abuseCases.id}
            )`,
          })
          .from(abuseCases)
          .leftJoin(users, eq(users.id, abuseCases.userId))
          .limit(input.perPage)
          .offset(offset)
          .where(where)
          .orderBy(...orderBy);

        const total = await tx
          .select({ value: count() })
          .from(abuseCases)
          .leftJoin(users, eq(users.id, abuseCases.userId))
          .where(where)
          .then(([row]) => row?.value ?? 0);

        return { data, total };
      },
      { accessMode: "read only", isolationLevel: "read committed" },
    );

    return {
      data: data.map(({ number, serverCount, ...row }) => ({
        ...row,
        reference: caseReference(number),
        serverCount: Number(serverCount),
        overdue: Boolean(row.respondBy && row.respondBy.getTime() < Date.now()),
      })),
      pageCount: Math.ceil(total / input.perPage),
    };
  } catch (error) {
    captureException(error);

    return { data: [], pageCount: 0 };
  }
}

/**
 * How many cases sit in each status, for the filter's facet counts.
 *
 * Unfiltered on purpose: a facet that only counts what the current filter
 * already lets through tells an operator nothing about what they are hiding.
 */
export async function getAbuseCaseStatusCounts(): Promise<
  Record<string, number>
> {
  "use cache: private";

  cacheLife({ revalidate: 5, stale: 5, expire: 60 });
  cacheTag("abuse-cases");

  await verifySession();

  try {
    const rows = await db
      .select({ status: abuseCases.status, value: count() })
      .from(abuseCases)
      .groupBy(abuseCases.status);

    return Object.fromEntries(rows.map((row) => [row.status, row.value]));
  } catch (error) {
    captureException(error);

    return {};
  }
}
