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
  eq,
  getTableColumns,
  ilike,
} from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxTemplates as pt,
  proxmoxTemplateGroups as ptg,
} from "@virtbase/db/schema";
import { getDateIntervalFilter } from "@virtbase/db/utils";
import { cacheLife, cacheTag } from "next/cache";
import type { GetTemplateGroupsSchema } from "../../lib/template-groups/validations";
import { verifySession } from "../verify-session";

const extras = {
  templatesCount: count(pt.id).as("templates_count"),
} as const;

export async function getProxmoxTemplateGroupsList(
  input: GetTemplateGroupsSchema,
) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("proxmox-template-groups", "template-groups");

  await verifySession();

  try {
    const offset = (input.page - 1) * input.perPage;

    const where = and(
      input.name ? ilike(ptg.name, `%${input.name}%`) : undefined,
      input.priority ? eq(ptg.priority, input.priority) : undefined,
      getDateIntervalFilter(ptg.createdAt, input.createdAt),
      getDateIntervalFilter(ptg.updatedAt, input.updatedAt),
    );

    const orderBy =
      input.sort.length > 0
        ? input.sort.map((item) =>
            item.desc
              ? // @ts-expect-error - index not typed
                desc(extras[item.id] ?? ptg[item.id])
              : // @ts-expect-error - index not typed
                asc(extras[item.id] ?? ptg[item.id]),
          )
        : [asc(ptg.name)];

    const { data, total } = await db.transaction(
      async (tx) => {
        const columns = getTableColumns(ptg);
        const data = await tx
          .select({
            ...columns,
            ...extras,
          })
          .from(ptg)
          .leftJoin(pt, eq(pt.proxmoxTemplateGroupId, ptg.id))
          .limit(input.perPage)
          .offset(offset)
          .where(where)
          .groupBy(ptg.id)
          .orderBy(...orderBy);

        const total = await tx.$count(ptg, where);

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
