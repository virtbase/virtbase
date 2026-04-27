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

import { eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxNodes as pn,
  proxmoxTemplates as pt,
  proxmoxTemplatesToProxmoxNodes as pt2pn,
} from "@virtbase/db/schema";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";

export const getTemplateGroups = cache(async (proxmoxNodeGroupId: string) => {
  "use cache";

  cacheTag(
    "checkout",
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
        .innerJoin(pt2pn, eq(pt.id, pt2pn.proxmoxTemplateId))
        .innerJoin(pn, eq(pt2pn.proxmoxNodeId, pn.id))
        .where(eq(pn.proxmoxNodeGroupId, proxmoxNodeGroupId))
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
