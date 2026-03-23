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
import { and, asc, desc, ilike, inArray } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { datacenters } from "@virtbase/db/schema";
import { getDateIntervalFilter } from "@virtbase/db/utils";
import { cacheLife, cacheTag } from "next/cache";
import type { GetDatacentersSchema } from "../../lib/datacenters/validations";
import { verifySession } from "../verify-session";

export async function getDatacentersList(input: GetDatacentersSchema) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("datacenters");

  await verifySession();

  try {
    const offset = (input.page - 1) * input.perPage;

    const where = and(
      input.country.length > 0
        ? inArray(datacenters.country, input.country)
        : undefined,
      input.name ? ilike(datacenters.name, `%${input.name}%`) : undefined,
      getDateIntervalFilter(datacenters.createdAt, input.createdAt),
    );

    const orderBy =
      input.sort.length > 0
        ? input.sort.map((item) =>
            item.desc ? desc(datacenters[item.id]) : asc(datacenters[item.id]),
          )
        : [asc(datacenters.name)];

    const { data, total } = await db.transaction(
      async (tx) => {
        const data = await tx
          .select()
          .from(datacenters)
          .limit(input.perPage)
          .offset(offset)
          .where(where)
          .orderBy(...orderBy);

        const total = await tx.$count(datacenters, where);

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

export type GetDatacentersListOutput = Awaited<
  ReturnType<typeof getDatacentersList>
>;
