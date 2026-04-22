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
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
} from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxTemplates, servers, users } from "@virtbase/db/schema";
import { getDateIntervalFilter } from "@virtbase/db/utils";
import { cacheLife, cacheTag } from "next/cache";
import type { GetServersSchema } from "../../lib/servers/validations";
import { verifySession } from "../verify-session";

export async function getServersList(input: GetServersSchema) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("servers");

  await verifySession();

  try {
    const offset = (input.page - 1) * input.perPage;

    const where = and(
      input.name ? ilike(servers.name, `%${input.name}%`) : undefined,
      input.vmid ? eq(servers.vmid, input.vmid) : undefined,
      input.template.length > 0
        ? inArray(servers.proxmoxTemplateId, input.template)
        : undefined,
      getDateIntervalFilter(servers.createdAt, input.createdAt),
      getDateIntervalFilter(servers.terminatesAt, input.terminatesAt),
    );

    const orderBy =
      input.sort.length > 0
        ? input.sort.map((item) =>
            item.desc ? desc(servers[item.id]) : asc(servers[item.id]),
          )
        : [asc(servers.name)];

    const { data, total } = await db.transaction(
      async (tx) => {
        const columns = getTableColumns(servers);
        const data = await tx
          .select({
            ...columns,
            template: {
              id: proxmoxTemplates.id,
              name: proxmoxTemplates.name,
              icon: proxmoxTemplates.icon,
            },
            user: {
              id: users.id,
              name: users.name,
              image: users.image,
            },
          })
          .from(servers)
          .leftJoin(
            proxmoxTemplates,
            eq(servers.proxmoxTemplateId, proxmoxTemplates.id),
          )
          .leftJoin(users, eq(servers.userId, users.id))
          .limit(input.perPage)
          .offset(offset)
          .where(where)
          .groupBy(servers.id, proxmoxTemplates.id, users.id)
          .orderBy(...orderBy);

        const total = await tx.$count(servers, where);

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
    console.error(error);
    captureException(error);

    return { data: [], pageCount: 0 };
  }
}
