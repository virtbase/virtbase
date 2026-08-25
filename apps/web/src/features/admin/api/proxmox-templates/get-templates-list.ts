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
import { and, asc, desc, eq, getTableColumns, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxNodes,
  proxmoxTemplateGroups,
  proxmoxTemplateImages,
  proxmoxTemplates,
} from "@virtbase/db/schema";
import { escapedIlike, getDateIntervalFilter } from "@virtbase/db/utils";
import { cacheLife, cacheTag } from "next/cache";
import type { GetProxmoxTemplatesSchema } from "../../lib/proxmox-templates/validations";
import { verifySession } from "../verify-session";

export async function getTemplatesList(input: GetProxmoxTemplatesSchema) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("proxmox-templates", "proxmox-template-images");

  await verifySession();

  try {
    const offset = (input.page - 1) * input.perPage;

    const where = and(
      input.name ? escapedIlike(proxmoxTemplates.name, input.name) : undefined,
      getDateIntervalFilter(proxmoxTemplates.createdAt, input.createdAt),
      getDateIntervalFilter(proxmoxTemplates.updatedAt, input.updatedAt),
    );

    const orderBy =
      input.sort.length > 0
        ? input.sort.map((item) =>
            item.desc
              ? desc(proxmoxTemplates[item.id])
              : asc(proxmoxTemplates[item.id]),
          )
        : [asc(proxmoxTemplates.name)];

    const { data, total } = await db.transaction(
      async (tx) => {
        const columns = getTableColumns(proxmoxTemplates);

        // How many nodes have this image settled, against how many nodes exist.
        // A template is only offered when every node has it, so "3/3" is the
        // number that decides whether customers can pick it.
        const data = await tx
          .select({
            ...columns,
            groupName: proxmoxTemplateGroups.name,
            readyNodes: sql<number>`(
              SELECT COUNT(*)::int
              FROM ${proxmoxTemplateImages}
              WHERE ${proxmoxTemplateImages.proxmoxTemplateId} = ${proxmoxTemplates.id}
                AND ${proxmoxTemplateImages.downloadedAt} IS NOT NULL
            )`.as("ready_nodes"),
            failedNodes: sql<number>`(
              SELECT COUNT(*)::int
              FROM ${proxmoxTemplateImages}
              WHERE ${proxmoxTemplateImages.proxmoxTemplateId} = ${proxmoxTemplates.id}
                AND ${proxmoxTemplateImages.failedAt} IS NOT NULL
            )`.as("failed_nodes"),
            lastError: sql<string | null>`(
              SELECT ${proxmoxTemplateImages.lastError}
              FROM ${proxmoxTemplateImages}
              WHERE ${proxmoxTemplateImages.proxmoxTemplateId} = ${proxmoxTemplates.id}
                AND ${proxmoxTemplateImages.lastError} IS NOT NULL
              LIMIT 1
            )`.as("last_error"),
            totalNodes:
              sql<number>`(SELECT COUNT(*)::int FROM ${proxmoxNodes})`.as(
                "total_nodes",
              ),
          })
          .from(proxmoxTemplates)
          .leftJoin(
            proxmoxTemplateGroups,
            eq(
              proxmoxTemplates.proxmoxTemplateGroupId,
              proxmoxTemplateGroups.id,
            ),
          )
          .limit(input.perPage)
          .offset(offset)
          .where(where)
          .orderBy(...orderBy);

        const total = await tx.$count(proxmoxTemplates, where);

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

/**
 * Per-node image state for one template, for the detail page.
 *
 * Left-joined from the node so a node with no row at all still appears - that
 * is the state that matters most, because it is the one that keeps a template
 * from being offered.
 */
export async function getTemplateImageStatus(proxmoxTemplateId: string) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("proxmox-template-images");

  await verifySession();

  try {
    return await db
      .select({
        proxmoxNodeId: proxmoxNodes.id,
        hostname: proxmoxNodes.hostname,
        storage: proxmoxNodes.importStorage,
        volid: proxmoxTemplateImages.volid,
        downloadedAt: proxmoxTemplateImages.downloadedAt,
        failedAt: proxmoxTemplateImages.failedAt,
        lastError: proxmoxTemplateImages.lastError,
        sizeBytes: proxmoxTemplateImages.sizeBytes,
        upid: proxmoxTemplateImages.upid,
      })
      .from(proxmoxNodes)
      .leftJoin(
        proxmoxTemplateImages,
        and(
          eq(proxmoxTemplateImages.proxmoxNodeId, proxmoxNodes.id),
          eq(proxmoxTemplateImages.proxmoxTemplateId, proxmoxTemplateId),
        ),
      )
      .orderBy(asc(proxmoxNodes.hostname));
  } catch (error) {
    captureException(error);

    return [];
  }
}

/** One template with everything the detail page edits. */
export async function getTemplate(id: string) {
  "use cache: private";

  cacheLife({ revalidate: 1, stale: 1, expire: 60 });
  cacheTag("proxmox-templates");

  await verifySession();

  try {
    return await db
      .select({
        ...getTableColumns(proxmoxTemplates),
        groupName: proxmoxTemplateGroups.name,
      })
      .from(proxmoxTemplates)
      .leftJoin(
        proxmoxTemplateGroups,
        eq(proxmoxTemplates.proxmoxTemplateGroupId, proxmoxTemplateGroups.id),
      )
      .where(eq(proxmoxTemplates.id, id))
      .limit(1)
      .then(([row]) => row ?? null);
  } catch (error) {
    captureException(error);

    return null;
  }
}
