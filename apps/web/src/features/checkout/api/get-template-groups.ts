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

import { asc, eq, sql } from "@virtbase/db";
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
      return tx
        .select({
          id: ptg.id,
          name: ptg.name,
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
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', ${pt.id},
                  'name', ${pt.name},
                  'icon', ${pt.icon},
                  'recommendedCores', ${pt.recommendedCores},
                  'recommendedMemory', ${pt.recommendedMemory},
                  'requiredStorage', ${pt.requiredStorage},
                  'recommendedStorage', ${pt.recommendedStorage}
                )
              ) 
              FILTER (WHERE ${pt.id} IS NOT NULL),
              '[]'
            )
          `,
        })
        .from(pt)
        .innerJoin(ptg, eq(pt.proxmoxTemplateGroupId, ptg.id))
        .innerJoin(pt2pn, eq(pt.id, pt2pn.proxmoxTemplateId))
        .innerJoin(pn, eq(pt2pn.proxmoxNodeId, pn.id))
        .where(eq(pn.proxmoxNodeGroupId, proxmoxNodeGroupId))
        .groupBy(ptg.id)
        .orderBy(asc(ptg.priority), asc(ptg.name));
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );
});
