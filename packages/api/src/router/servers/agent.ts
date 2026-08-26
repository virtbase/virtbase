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

import type { TRPCRouterRecord } from "@trpc/server";
import { mapProxmoxServerStatus, ProxmoxServerStatus } from "@virtbase/utils";
import type { ServerAgentStatus } from "@virtbase/validators/server";
import {
  GetServerAgentStatusInputSchema,
  GetServerAgentStatusOutputSchema,
} from "@virtbase/validators/server";
import { storeDetectedOperatingSystem } from "../../guest-os";
// Imported from the agent module rather than the `proxmox` barrel: router
// tests replace that barrel wholesale to inject a fake instance, which would
// otherwise take these helpers with it.
import {
  getGuestOsInfo,
  probeGuestAgent,
  resolveAgentStatus,
} from "../../proxmox/agent";
import { serverProcedure } from "../../trpc";
import { cached } from "../../upstash";

/**
 * How long a probe result is reused.
 *
 * Long enough that the pages showing it can refetch freely, short enough that
 * installing the agent is reflected while the customer is still looking at the
 * instructions.
 */
const CACHE_TTL_SECONDS = 60;

/**
 * The cached payload.
 *
 * `checkedAt` is an epoch number rather than a `Date` on purpose: Redis stores
 * plain JSON, so a `Date` would come back as a string and fail the output
 * schema on every cache hit.
 */
interface CachedAgentStatus {
  status: ServerAgentStatus;
  configured: boolean;
  reachable: boolean;
  execAvailable: boolean | null;
  version: string | null;
  os: { id: string | null; prettyName: string | null } | null;
  checkedAt: number;
}

export const serversAgentRouter = {
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/agent",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Get guest agent status",
        description:
          "Returns the state of the `qemu-guest-agent` inside a server. Features that inspect the guest - storage usage, password resets, firewall detection - depend on it, and it can be removed or restricted from inside the server.",
      },
      permissions: {
        servers: ["read"],
      },
    })
    .input(GetServerAgentStatusInputSchema)
    .output(GetServerAgentStatusOutputSchema)
    .query(async ({ ctx, input }) => {
      const { server, instance } = ctx;
      const { vm } = instance;

      const result = await cached<CachedAgentStatus>(
        `guest-agent:${server.id}`,
        CACHE_TTL_SECONDS,
        async () => {
          // One call answers both questions: whether the server is running and
          // whether its configuration enables the agent at all.
          const current = await vm.status.current.$get();

          const configured = Boolean(current.agent);
          const running =
            mapProxmoxServerStatus(current) === ProxmoxServerStatus.RUNNING;

          if (!configured || !running) {
            return {
              status: resolveAgentStatus({
                configured,
                running,
                probe: null,
                os: null,
              }),
              configured,
              reachable: false,
              execAvailable: null,
              version: null,
              os: null,
              checkedAt: Date.now(),
            };
          }

          // Both calls fail together when the agent is gone, so paying for one
          // extra round trip beats serialising them on the healthy path.
          const [probe, os] = await Promise.all([
            probeGuestAgent(vm),
            getGuestOsInfo(vm),
          ]);

          // This endpoint reads `guest-get-osinfo` to decide whether the guest
          // is one the POSIX probes can inspect. That reply is also the only
          // authoritative answer to what the server is running, so it is kept
          // rather than thrown away - the dashboard's logo and OS name come
          // from it. Wrapped in the same cache as the probe, so it costs
          // nothing extra and cannot be hammered.
          await storeDetectedOperatingSystem(ctx.db, server.id, os);

          return {
            status: resolveAgentStatus({ configured, running, probe, os }),
            configured,
            reachable: probe.reachable,
            execAvailable: probe.execAvailable,
            version: probe.version,
            os: os && { id: os.id, prettyName: os.prettyName },
            checkedAt: Date.now(),
          };
        },
        { refresh: input.refresh },
      );

      return {
        agent: {
          status: result.status,
          configured: result.configured,
          reachable: result.reachable,
          exec_available: result.execAvailable,
          version: result.version,
          os: result.os && {
            id: result.os.id,
            pretty_name: result.os.prettyName,
          },
          checked_at: new Date(result.checkedAt),
        },
      };
    }),
} satisfies TRPCRouterRecord;
