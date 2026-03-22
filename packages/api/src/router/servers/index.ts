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

import { and, count, eq } from "@virtbase/db";
import {
  datacenters,
  proxmoxNodes,
  proxmoxTemplates,
  serverPlans,
  servers,
} from "@virtbase/db/schema";
import { buildOrderBy } from "@virtbase/db/utils";
import { DEFAULT_PAGE, DEFAULT_PER_PAGE } from "@virtbase/utils";
import { getPaginationMeta } from "@virtbase/validators";
import {
  GetServerInputSchema,
  GetServerOutputSchema,
  ListServersInputSchema,
  ListServersOutputSchema,
  RenameServerInputSchema,
  RenameServerOutputSchema,
} from "@virtbase/validators/server";
import {
  createTRPCRouter,
  protectedProcedure,
  serverProcedure,
} from "../../trpc";
import { serversConsoleRouter } from "./console";
import { serverFirewallRouter } from "./firewall";
import { serversGraphsRouter } from "./graphs";
import { serversStatusRouter } from "./status";

export const serversRouter = createTRPCRouter({
  firewall: serverFirewallRouter,
  graphs: serversGraphsRouter,
  status: serversStatusRouter,
  console: serversConsoleRouter,
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Get a server",
        description: "Returns a server by its unique identifier.",
      },
    })
    .input(GetServerInputSchema)
    .output(GetServerOutputSchema)
    .query(async ({ ctx }) => {
      const { server } = ctx;

      return {
        server: {
          id: server.id,
          name: server.name,
          plan: server.plan,
          template: server.template,
          datacenter: server.datacenter,
          node: server.node,
          installed_at: server.installed_at,
          suspended_at: server.suspended_at,
          terminates_at: server.terminates_at,
        },
      };
    }),
  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "List servers",
        description: "Returns a list of servers for the current user.",
      },
    })
    .input(ListServersInputSchema)
    .output(ListServersOutputSchema)
    .query(async ({ ctx, input }) => {
      const { db, userId } = ctx;

      const page = input.page ?? DEFAULT_PAGE;
      const perPage = input.per_page ?? DEFAULT_PER_PAGE;

      const where = and(
        // [!] Authorization: Only allow the user to access their own servers
        eq(servers.userId, userId),
        // Filters
        input.name ? eq(servers.name, input.name) : undefined,
      );

      const orderBy = buildOrderBy(servers, input.sort, servers.id);

      const offset = (page - 1) * perPage;

      const { data, total } = await db.transaction(
        async (tx) => {
          const data = await tx
            .select({
              id: servers.id,
              name: servers.name,
              installedAt: servers.installedAt,
              suspendedAt: servers.suspendedAt,
              terminatesAt: servers.terminatesAt,
              plan: !input.expand.includes("plan")
                ? serverPlans.id
                : {
                    id: serverPlans.id,
                    name: serverPlans.name,
                    cores: serverPlans.cores,
                    memory: serverPlans.memory,
                    storage: serverPlans.storage,
                  },
              template: !input.expand.includes("template")
                ? proxmoxTemplates.id
                : {
                    id: proxmoxTemplates.id,
                    icon: proxmoxTemplates.icon,
                  },
              datacenter: !input.expand.includes("datacenter")
                ? datacenters.id
                : {
                    id: datacenters.id,
                    name: datacenters.name,
                  },
              node: !input.expand.includes("node")
                ? proxmoxNodes.id
                : {
                    id: proxmoxNodes.id,
                    hostname: proxmoxNodes.hostname,
                    netrate: proxmoxNodes.netrate,
                    storage_description: proxmoxNodes.storageDescription,
                    memory_description: proxmoxNodes.memoryDescription,
                    cpu_description: proxmoxNodes.cpuDescription,
                  },
            })
            .from(servers)
            .innerJoin(serverPlans, eq(servers.serverPlanId, serverPlans.id))
            .innerJoin(proxmoxNodes, eq(proxmoxNodes.id, servers.proxmoxNodeId))
            .innerJoin(
              datacenters,
              eq(datacenters.id, proxmoxNodes.datacenterId),
            )
            .leftJoin(
              proxmoxTemplates,
              eq(servers.proxmoxTemplateId, proxmoxTemplates.id),
            )
            .limit(perPage)
            .offset(offset)
            .where(where)
            .orderBy(...orderBy);

          const total = await tx
            .select({ count: count() })
            .from(servers)
            .where(where)
            .execute()
            .then(([res]) => res?.count ?? 0);

          return { data, total };
        },
        {
          accessMode: "read only",
          isolationLevel: "read committed",
        },
      );

      return {
        servers: data.map((item) => ({
          id: item.id,
          name: item.name,
          template: item.template,
          plan: item.plan,
          datacenter: item.datacenter,
          node: item.node,
          installed_at: item.installedAt,
          suspended_at: item.suspendedAt,
          terminates_at: item.terminatesAt,
        })),
        meta: {
          pagination: getPaginationMeta({
            total,
            page,
            perPage,
          }),
        },
      };
    }),
  rename: serverProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/servers/{server_id}/rename",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Rename a server",
        description: "Renames a server by its unique identifier.",
      },
    })
    .input(RenameServerInputSchema)
    .output(RenameServerOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, server, userId } = ctx;

      await db.transaction(async (tx) => {
        await tx
          .update(servers)
          .set({
            name: input.name,
          })
          .where(
            and(
              eq(servers.id, server.id),
              // [!] Additional check: Only allow the user to rename their own server
              // Handled by the server middleware, but check as extra safety
              eq(servers.userId, userId),
            ),
          );
      });
    }),
});
