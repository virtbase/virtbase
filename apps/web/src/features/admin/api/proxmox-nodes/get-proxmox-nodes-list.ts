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
  sum,
} from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { proxmoxNodes, serverPlans, servers } from "@virtbase/db/schema";
import { getDateIntervalFilter } from "@virtbase/db/utils";
import { cacheLife, cacheTag } from "next/cache";
import type { GetProxmoxNodesSchema } from "../../lib/proxmox-nodes/validations";
import { verifySession } from "../verify-session";

const extras = {
  guestCount: count(serverPlans.id).as("guest_count"),
  memoryUsage: sum(serverPlans.memory).as("memory_usage"),
  storageUsage: sum(serverPlans.storage).as("storage_usage"),
  coresUsage: sum(serverPlans.cores).as("cores_usage"),
  netrateUsage: sum(serverPlans.netrate).as("netrate_usage"),
} as const;

export async function getProxmoxNodesList(input: GetProxmoxNodesSchema) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("proxmox-nodes");

  await verifySession();

  try {
    const offset = (input.page - 1) * input.perPage;

    const where = and(
      input.hostname
        ? ilike(proxmoxNodes.hostname, `%${input.hostname}%`)
        : undefined,
      getDateIntervalFilter(proxmoxNodes.createdAt, input.createdAt),
    );

    const orderBy =
      input.sort.length > 0
        ? input.sort.map((item) =>
            item.desc
              ? // @ts-expect-error - index not typed
                desc(extras[item.id] ?? proxmoxNodes[item.id])
              : // @ts-expect-error - index not typed
                asc(extras[item.id] ?? proxmoxNodes[item.id]),
          )
        : [asc(proxmoxNodes.hostname)];

    const { data, total } = await db.transaction(
      async (tx) => {
        const {
          // [!] Sensitive data, do not include in the result
          tokenID: _,
          tokenSecret: __,
          ...columns
        } = getTableColumns(proxmoxNodes);
        const data = await tx
          .select({
            ...columns,
            ...extras,
          })
          .from(proxmoxNodes)
          .leftJoin(servers, eq(servers.proxmoxNodeId, proxmoxNodes.id))
          .leftJoin(serverPlans, eq(servers.serverPlanId, serverPlans.id))
          .limit(input.perPage)
          .offset(offset)
          .where(where)
          .groupBy(proxmoxNodes.id)
          .orderBy(...orderBy);

        const total = await tx.$count(proxmoxNodes, where);

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
