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

import { alias, asc, eq, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import {
  proxmoxNodes as pn,
  proxmoxTemplates as pt,
  proxmoxTemplatesToProxmoxNodes as pt2pn,
  proxmoxTemplateGroups as ptg,
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

  return db.transaction(
    async (tx) => {
      const nodesInGroup = alias(pn, "nodes_in_group");

      // One row per (group, template) where the template is on every node in the group
      const eligible = tx
        .select({
          groupId: ptg.id,
          groupName: ptg.name,
          groupPriority: ptg.priority,
          templateId: pt.id,
          templateName: pt.name,
          templateIcon: pt.icon,
          templateRecommendedCores: pt.recommendedCores,
          templateRecommendedMemory: pt.recommendedMemory,
          templateRequiredStorage: pt.requiredStorage,
          templateRecommendedStorage: pt.recommendedStorage,
        })
        .from(pt)
        .innerJoin(ptg, eq(pt.proxmoxTemplateGroupId, ptg.id))
        .innerJoin(pt2pn, eq(pt.id, pt2pn.proxmoxTemplateId))
        .innerJoin(pn, eq(pt2pn.proxmoxNodeId, pn.id))
        .where(eq(pn.proxmoxNodeGroupId, proxmoxNodeGroupId))
        .groupBy(ptg.id, pt.id)
        .having(sql`
          COUNT(DISTINCT ${pn.id}) = (
            SELECT COUNT(*)
            FROM ${pn} ${nodesInGroup}
            WHERE ${eq(nodesInGroup.proxmoxNodeGroupId, proxmoxNodeGroupId)}
          )
        `)
        .as("eligible");

      return tx
        .select({
          id: eligible.groupId,
          name: eligible.groupName,
          templates: sql<
            Pick<
              typeof pt.$inferSelect,
              | "id"
              | "name"
              | "icon"
              | "recommendedCores"
              | "recommendedMemory"
              | "requiredStorage"
              | "recommendedStorage"
            >[]
          >`
              COALESCE(
                JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'id', ${eligible.templateId},
                    'name', ${eligible.templateName},
                    'icon', ${eligible.templateIcon},
                    'recommendedCores', ${eligible.templateRecommendedCores},
                    'recommendedMemory', ${eligible.templateRecommendedMemory},
                    'requiredStorage', ${eligible.templateRequiredStorage},
                    'recommendedStorage', ${eligible.templateRecommendedStorage}
                  ) ORDER BY ${eligible.templateName} ASC
                ),
                '[]'::jsonb
              )
            `,
        })
        .from(eligible)
        .groupBy(eligible.groupId, eligible.groupName, eligible.groupPriority)
        .orderBy(asc(eligible.groupPriority), asc(eligible.groupName));
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );
});
