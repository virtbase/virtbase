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
import { encryptPayload } from "@virtbase/utils";
import type { WebSocketData } from "@virtbase/validators";
import {
  GetServerConsoleInputSchema,
  GetServerConsoleOutputSchema,
} from "@virtbase/validators/server";
import { createTRPCRouter, serverProcedure } from "../../trpc";

export const serversConsoleRouter = createTRPCRouter({
  get: serverProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/servers/{server_id}/console",
        protect: true,
        contentTypes: ["application/json"],
        tags: ["Servers"],
        summary: "Get console URL",
        description: "Returns the console noVNC console URL for a server.",
      },
      forbiddenStates: ["suspended", "terminated", "installing"],
    })
    .input(GetServerConsoleInputSchema)
    .output(GetServerConsoleOutputSchema)
    .query(async ({ ctx }) => {
      const { instance, server, proxmoxNode } = ctx;

      const [ticket, data] = await Promise.all([
        instance.engine.getTicket().then(({ ticket }) => ticket),
        instance.vm.vncproxy.$post({
          websocket: true,
          "generate-password": true,
        }),
      ]);

      const secret = process.env.NOVNC_PROXY_SECRET;
      const proxyUrl = process.env.NOVNC_PROXY_URL;
      if (!secret || !proxyUrl) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      const { vncticket, port, password } = data;

      if (!password) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      const payload = {
        vmid: server.vmid,
        type: "qemu",
        host: proxmoxNode.fqdn,
        node: proxmoxNode.hostname,
        ticket,
        vncticket,
        port,
      } satisfies WebSocketData;
      const encryptedPayload = await encryptPayload(
        JSON.stringify(payload),
        secret,
      );

      const url = new URL("https://novnc.com/noVNC/vnc.html");
      url.searchParams.set("host", proxyUrl);
      url.searchParams.set("port", "443");
      url.searchParams.set("password", password);
      url.searchParams.set("path", `?payload=${encryptedPayload}`);
      url.searchParams.set("encrypt", "true");
      url.searchParams.set("resize", "scale");
      url.searchParams.set("autoconnect", "true");

      return url.toString();
    }),
});
