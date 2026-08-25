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

import { and, eq, isNotNull, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxNodes as pn,
  proxmoxTemplates as pt,
  proxmoxTemplateImages as pti,
} from "@virtbase/db/schema";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";

export const getTemplateGroups = cache(async (proxmoxNodeGroupId: string) => {
  "use cache";

  cacheTag(
    "checkout",
    "proxmox-template-images",
    "proxmox-template-groups",
    "template-groups",
    "proxmox-templates",
  );
  cacheLife("max");

  const result = await db.transaction(
    async (tx) => {
      const validTemplates = await tx
        .select({ id: pt.id })
        .from(pt)
        .innerJoin(pti, eq(pt.id, pti.proxmoxTemplateId))
        .innerJoin(pn, eq(pti.proxmoxNodeId, pn.id))
        .where(
          and(
            eq(pn.proxmoxNodeGroupId, proxmoxNodeGroupId),
            // Withdrawn by an operator, or not yet declared against an image.
            eq(pt.enabled, true),
            isNotNull(pt.imageUrl),
            // The image has to be settled, not merely attempted.
            isNotNull(pti.downloadedAt),
          ),
        )
        .groupBy(pt.id)
        .having(sql`
          COUNT(DISTINCT ${pn.id}) = (
            SELECT COUNT(*)
            FROM ${pn}
            WHERE ${pn.proxmoxNodeGroupId} = ${proxmoxNodeGroupId}
          )
        `);

      return tx.query.proxmoxTemplateGroups.findMany({
        columns: {
          id: true,
          name: true,
          priority: true,
        },
        with: {
          proxmoxTemplates: {
            where: {
              id: {
                in: validTemplates.map((t) => t.id),
              },
            },
            columns: {
              id: true,
              name: true,
              icon: true,
              recommendedCores: true,
              recommendedMemory: true,
              requiredStorage: true,
              recommendedStorage: true,
            },
          },
        },
        orderBy: (t, { asc }) => [asc(t.priority), asc(t.name)],
      });
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  return result
    .filter((entry) => entry.proxmoxTemplates.length > 0)
    .map((entry) => {
      return {
        id: entry.id,
        name: entry.name,
        templates: entry.proxmoxTemplates,
      };
    });
});
