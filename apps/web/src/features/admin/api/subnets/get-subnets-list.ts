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
import {
  and,
  asc,
  count,
  desc,
  getTableColumns,
  ilike,
  inArray,
  sql,
} from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { subnets } from "@virtbase/db/schema";
import { getDateIntervalFilter } from "@virtbase/db/utils";
import { cacheLife, cacheTag } from "next/cache";
import type { GetSubnetsSchema } from "../../lib/subnets/validations";
import { verifySession } from "../verify-session";

export async function getSubnetsList(input: GetSubnetsSchema) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("subnets");

  await verifySession();

  try {
    const offset = (input.page - 1) * input.perPage;

    const where = and(
      input.cidr
        ? ilike(sql`text(${subnets.cidr})`, `%${input.cidr}%`)
        : undefined,
      input.vlan.length > 0 ? inArray(subnets.vlan, input.vlan) : undefined,
      input.family.length > 0
        ? inArray(sql<4 | 6>`family(${subnets.cidr})`, input.family)
        : undefined,
      getDateIntervalFilter(subnets.createdAt, input.createdAt),
    );

    const orderBy =
      input.sort.length > 0
        ? input.sort.map((item) =>
            item.desc ? desc(subnets[item.id]) : asc(subnets[item.id]),
          )
        : [asc(subnets.cidr)];

    const { data, total } = await db.transaction(
      async (tx) => {
        const columns = getTableColumns(subnets);
        const data = await tx
          .select({
            ...columns,
            family: sql<4 | 6>`family(${subnets.cidr})`,
          })
          .from(subnets)
          .limit(input.perPage)
          .offset(offset)
          .where(where)
          .orderBy(...orderBy);

        const total = await tx.$count(subnets, where);

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

export type GetSubnetsListOutput = Awaited<ReturnType<typeof getSubnetsList>>;

export async function getSubnetVlanCounts() {
  "use cache: private";

  cacheLife("hours");
  cacheTag("subnet-vlan-counts", "subnets");

  await verifySession();

  try {
    return await db.transaction(
      async (tx) => {
        return tx
          .select({
            vlan: subnets.vlan,
            count: count(),
          })
          .from(subnets)
          .groupBy(subnets.vlan)
          .then((res) =>
            res.reduce(
              (acc, { vlan, count }) => {
                acc[vlan] = count;
                return acc;
              },
              {} as Record<number, number>,
            ),
          );
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );
  } catch {
    return {};
  }
}

export async function getSubnetTypeCounts() {
  "use cache: private";

  cacheLife("hours");
  cacheTag("subnet-type-counts", "subnets");

  await verifySession();

  try {
    return await db.transaction(
      async (tx) => {
        return tx
          .select({
            type: sql<4 | 6>`family(${subnets.cidr})`,
            count: count(),
          })
          .from(subnets)
          .groupBy(sql<4 | 6>`family(${subnets.cidr})`)
          .then((res) =>
            res.reduce(
              (acc, { type, count }) => {
                acc[type] = count;
                return acc;
              },
              {} as Record<4 | 6, number>,
            ),
          );
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );
  } catch {
    return {
      4: 0,
      6: 0,
    };
  }
}
