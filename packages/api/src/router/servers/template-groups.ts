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

          // One row per (group, template) where the template is on every node in the group
          const eligible = tx
            .select({
              groupId: ptg.id,
              groupName: ptg.name,
              groupPriority: ptg.priority,
              templateId: pt.id,
              templateName: pt.name,
              templateIcon: pt.icon,
              templateRequiredCores: pt.requiredCores,
              templateRecommendedCores: pt.recommendedCores,
              templateRequiredMemory: pt.requiredMemory,
              templateRecommendedMemory: pt.recommendedMemory,
              templateRequiredStorage: pt.requiredStorage,
              templateRecommendedStorage: pt.recommendedStorage,
            })
            .from(pt)
            .innerJoin(ptg, eq(pt.proxmoxTemplateGroupId, ptg.id))
            .innerJoin(pt2pn, eq(pt.id, pt2pn.proxmoxTemplateId))
            .innerJoin(pn, eq(pt2pn.proxmoxNodeId, pn.id))
            .where(eq(pn.proxmoxNodeGroupId, plan.proxmoxNodeGroupId))
            .groupBy(ptg.id, pt.id)
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
            .as("eligible");

          return tx
            .select({
              id: eligible.groupId,
              name: eligible.groupName,
              templates: sql<
                GetServerTemplateGroupsOutput["template_groups"][number]["templates"]
              >`
                  COALESCE(
                    JSONB_AGG(
                      JSONB_BUILD_OBJECT(
                        'id', ${eligible.templateId},
                        'name', ${eligible.templateName},
                        'icon', ${eligible.templateIcon},
                        'required_cores', ${eligible.templateRequiredCores},
                        'recommended_cores', ${eligible.templateRecommendedCores},
                        'required_memory', ${eligible.templateRequiredMemory},
                        'recommended_memory', ${eligible.templateRecommendedMemory},
                        'required_storage', ${eligible.templateRequiredStorage},
                        'recommended_storage', ${eligible.templateRecommendedStorage}
                      ) ORDER BY ${eligible.templateName} ASC
                    ),
                    '[]'::jsonb
                  )
                `,
            })
            .from(eligible)
            .groupBy(
              eligible.groupId,
              eligible.groupName,
              eligible.groupPriority,
            )
            .orderBy(asc(eligible.groupPriority), asc(eligible.groupName));
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
