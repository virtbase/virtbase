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
import { eq, sql } from "@virtbase/db";
import { serverPlans, servers } from "@virtbase/db/schema";
import {
  GetServerPlanInputSchema,
  GetServerPlanOutputSchema,
} from "@virtbase/validators/server";
import { createTRPCRouter, serverProcedure } from "../../trpc";

export const serversPlanRouter = createTRPCRouter({
  get: serverProcedure
    .input(GetServerPlanInputSchema)
    .output(GetServerPlanOutputSchema)
    .query(async ({ ctx }) => {
      const { db, server } = ctx;

      const { current, plans } = await db.transaction(async (tx) => {
        const current = await tx
          .select({
            id: serverPlans.id,
            storage: serverPlans.storage,
            proxmoxNodeGroupId: serverPlans.proxmoxNodeGroupId,
          })
          .from(servers)
          .where(eq(servers.id, server.id))
          .innerJoin(serverPlans, eq(servers.serverPlanId, serverPlans.id))
          .limit(1)
          .then(([row]) => row);

        if (!current) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }

        const plans = await tx
          .select({
            id: serverPlans.id,
            name: serverPlans.name,
            cores: serverPlans.cores,
            memory: serverPlans.memory,
            storage: serverPlans.storage,
            netrate: serverPlans.netrate,
            price: serverPlans.price,
            // TODO: Resource usage
            available: sql<boolean>`TRUE`,
          })
          .from(serverPlans)
          .where(
            eq(serverPlans.proxmoxNodeGroupId, current.proxmoxNodeGroupId),
          );

        return {
          current,
          plans,
        };
      });

      return {
        plans: plans.map((plan) => ({
          ...plan,
          current: plan.id === current.id,
        })),
      };
    }),
});
