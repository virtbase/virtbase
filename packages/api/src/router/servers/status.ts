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

import { mapProxmoxServerStatus, mapProxmoxTaskStatus } from "@virtbase/utils";
import {
  GetServerStatusInputSchema,
  GetServerStatusOutputSchema,
  UpdateServerStatusInputSchema,
  UpdateServerStatusOutputSchema,
} from "@virtbase/validators/server";
import { getLastTask } from "../../proxmox";
import { getDiskInfo } from "../../proxmox/get-disk-info";
import { createTRPCRouter, serverProcedure } from "../../trpc";

export const serversStatusRouter = createTRPCRouter({
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/status",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Get server status",
        description: "Returns the status of a server.",
      },
    })
    .input(GetServerStatusInputSchema)
    .output(GetServerStatusOutputSchema)
    .query(async ({ ctx, input }) => {
      const { server, instance } = ctx;

      const [statusResponse, lastTask] = await Promise.all([
        instance.vm.status.current.$get(),
        getLastTask(instance, server.vmid),
      ]);

      let disk: number | null = null;
      if (
        input.with_storage_usage &&
        statusResponse.agent &&
        statusResponse.status === "running" &&
        statusResponse.qmpstatus === "running"
      ) {
        const diskInfo = await getDiskInfo(instance, server.vmid);
        if (diskInfo) {
          disk = diskInfo.totalUsedBytes;
        }
      }

      return {
        status: {
          state: mapProxmoxServerStatus(statusResponse),
          task: lastTask ? mapProxmoxTaskStatus(lastTask) : null,
          stats: {
            netin: statusResponse.netin,
            netout: statusResponse.netout,
            uptime: statusResponse.uptime,
            mem:
              // Normalize memory usage
              Math.min(
                statusResponse.mem ?? 0,
                statusResponse.maxmem ?? statusResponse.mem,
              ),
            freemem: statusResponse.freemem,
            maxmem: statusResponse.maxmem,
            // Normalize disk usage
            disk: disk
              ? Math.min(disk, statusResponse.maxdisk ?? disk)
              : (statusResponse.disk ?? 0),
            cpu: statusResponse.cpu,
            maxdisk: statusResponse.maxdisk,
            cpus: statusResponse.cpus,
          },
          installed_at: server.installed_at,
          suspended_at: server.suspended_at,
          terminates_at: server.terminates_at,
        },
      };
    }),
  update: serverProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/servers/{server_id}/status",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Change status",
        description: "Change the status of a server.",
      },
      forbiddenStates: ["suspended", "terminated", "installing"],
    })
    .input(UpdateServerStatusInputSchema)
    .output(UpdateServerStatusOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { instance } = ctx;
      const { action } = input;

      switch (action) {
        case "start":
          await instance.vm.status.start.$post();
          break;
        case "stop":
          await instance.vm.status.stop.$post();
          break;
        case "pause":
          await instance.vm.status.suspend.$post({
            todisk: false,
          });
          break;
        case "resume":
          await instance.vm.status.resume.$post();
          break;
        case "suspend":
          await instance.vm.status.suspend.$post({
            todisk: true,
          });
          break;
        case "reset":
          await instance.vm.status.reset.$post();
          break;
        case "reboot":
          await instance.vm.status.reboot.$post();
          break;
        case "shutdown":
          await instance.vm.status.shutdown.$post();
          break;
        default:
          break;
      }
    }),
});
