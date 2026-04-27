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

import { TRPCError } from "@trpc/server";
import { alias, asc, eq, sql } from "@virtbase/db";
import {
  proxmoxNodes as pn,
  proxmoxTemplates as pt,
  proxmoxTemplatesToProxmoxNodes as pt2pn,
  proxmoxTemplateGroups as ptg,
  serverPlans,
  servers,
} from "@virtbase/db/schema";
import type { GetServerTemplateGroupsOutput } from "@virtbase/validators/server";
import {
  GetServerTemplateGroupsInputSchema,
  GetServerTemplateGroupsOutputSchema,
} from "@virtbase/validators/server";
import { createTRPCRouter, serverProcedure } from "../../trpc";

export const serversTemplateGroupsRouter = createTRPCRouter({
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/template-groups",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Get template groups",
        description: [
          "Returns available template groups for a server.",
          "",
          "Template groups are sorted by priority and alphabetically.",
        ].join("\n"),
      },
      forbiddenStates: ["terminated", "suspended"],
      permissions: {
        servers: ["read"],
      },
    })
    .input(GetServerTemplateGroupsInputSchema)
    .output(GetServerTemplateGroupsOutputSchema)
    .query(async ({ ctx }) => {
      const { db, server } = ctx;

      const templateGroups = await db.transaction(
        async (tx) => {
          const plan = await tx
            .select({
              proxmoxNodeGroupId: serverPlans.proxmoxNodeGroupId,
            })
            .from(servers)
            .innerJoin(serverPlans, eq(servers.serverPlanId, serverPlans.id))
            .where(eq(servers.id, server.id))
            .limit(1)
            .then(([row]) => row);

          if (!plan) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
            });
          }

          const nodesInGroup = alias(pn, "nodes_in_group");

          return (
            tx
              .select({
                id: ptg.id,
                name: ptg.name,
                templates: sql<
                  GetServerTemplateGroupsOutput["template_groups"][number]["templates"]
                >`
                  COALESCE(
                    JSONB_AGG(
                      DISTINCT JSONB_BUILD_OBJECT(
                        'id', ${pt.id},
                        'name', ${pt.name},
                        'icon', ${pt.icon},
                        'required_cores', ${pt.requiredCores},
                        'recommended_cores', ${pt.recommendedCores},
                        'required_memory', ${pt.requiredMemory},
                        'recommended_memory', ${pt.recommendedMemory},
                        'required_storage', ${pt.requiredStorage},
                        'recommended_storage', ${pt.recommendedStorage}
                      )
                    ) FILTER (WHERE ${pt.id} IS NOT NULL),
                    '[]'::jsonb
                  )
                `,
              })
              .from(pt)
              .innerJoin(ptg, eq(pt.proxmoxTemplateGroupId, ptg.id))
              .innerJoin(pt2pn, eq(pt.id, pt2pn.proxmoxTemplateId))
              .innerJoin(pn, eq(pt2pn.proxmoxNodeId, pn.id))
              .where(eq(pn.proxmoxNodeGroupId, plan.proxmoxNodeGroupId))
              .groupBy(ptg.id, pt.id)
              // Only include template groups that have all nodes in the group
              .having(sql`
                COUNT(DISTINCT ${pn.id}) = (
                  SELECT COUNT(*)
                  FROM ${pn} ${nodesInGroup}
                  WHERE ${eq(
                    nodesInGroup.proxmoxNodeGroupId,
                    plan.proxmoxNodeGroupId,
                  )}
                )
              `)
              .orderBy(asc(ptg.priority), asc(ptg.name))
          );
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      return {
        template_groups: templateGroups,
      };
    }),
});
