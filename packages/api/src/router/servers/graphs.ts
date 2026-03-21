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

import {
  GetServerGraphsInputSchema,
  GetServerGraphsOutputSchema,
} from "@virtbase/validators/server";
import { createTRPCRouter, serverProcedure } from "../../trpc";

export const serversGraphsRouter = createTRPCRouter({
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/graphs",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Get server graphs",
        description: "Returns the graphs for a server.",
      },
    })
    .input(GetServerGraphsInputSchema)
    .output(GetServerGraphsOutputSchema)
    .query(async ({ ctx, input }) => {
      const { instance, server } = ctx;
      const { timeframe, cf } = input;

      const data = await instance.vm.rrddata.$get({
        timeframe,
        cf,
      });

      // Only return data after the server was created
      const filteredData = data.map((item) => {
        if (item.time > server.created_at.getTime() / 1000) {
          return {
            // Normalize CPU usage
            cpu: Math.max(0, Math.min(1, item.cpu ?? 0)),
            mem: item.mem ?? 0,
            maxmem: item.maxmem ?? 0,
            diskread: item.diskread ?? 0,
            diskwrite: item.diskwrite ?? 0,
            netin: item.netin ?? 0,
            netout: item.netout ?? 0,
            time: item.time,
          };
        }

        // Still return the time point, but empty data
        return {
          cpu: 0,
          mem: 0,
          maxmem: 0,
          diskread: 0,
          diskwrite: 0,
          netin: 0,
          netout: 0,
          time: item.time,
        };
      });

      return {
        data: filteredData,
      };
    }),
});
