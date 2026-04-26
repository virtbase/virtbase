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
import { eq } from "@virtbase/db";
import { getPlansWithAvailability } from "@virtbase/db/queries";
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

      const current = await db
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

      const plans = await getPlansWithAvailability(
        eq(serverPlans.proxmoxNodeGroupId, current.proxmoxNodeGroupId),
      );

      return {
        plans: plans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          cores: plan.cores,
          memory: plan.memory,
          storage: plan.storage,
          netrate: plan.netrate,
          price: plan.price,
          current: plan.id === current.id,
          available: plan.isAvailable,
        })),
      };
    }),
});
