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
import { TRPCError } from "@trpc/server";
import { encryptPayload } from "@virtbase/utils";
import type { WebSocketData } from "@virtbase/validators";
import {
  GetServerConsoleInputSchema,
  GetServerConsoleOutputSchema,
} from "@virtbase/validators/server";
import { serverProcedure } from "../../trpc";

/**
 * How long a minted console payload stays usable, in seconds.
 *
 * The payload travels through the customer's browser and is handed straight
 * back to the noVNC proxy, so without an expiry it is replayable for as long as
 * the Proxmox vncticket inside it lives. Only the gap between minting the URL
 * and the browser opening the websocket needs covering — a few seconds in
 * practice — but the console query refetches every ten minutes, so five leaves
 * plenty of slack for a slow page load while still ending well before the next
 * payload is minted.
 */
const CONSOLE_PAYLOAD_TTL_SECONDS = 5 * 60;

export const serversConsoleRouter = {
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
      permissions: {
        console: ["read"],
      },
      forbiddenStates: ["suspended", "terminated", "installing"],
    })
    .input(GetServerConsoleInputSchema)
    .output(GetServerConsoleOutputSchema)
    .query(async ({ ctx }) => {
      const { instance, server, proxmoxNode, userId } = ctx;

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

      const { ticket: vncticket, port, password } = data;

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
        // Bound to the session it was minted for. The ciphertext is
        // authenticated, so these claims cannot be edited by whoever holds the
        // URL, and the expiry bounds how long a leaked one stays useful.
        serverId: server.id,
        userId,
        exp: Math.floor(Date.now() / 1000) + CONSOLE_PAYLOAD_TTL_SECONDS,
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
} satisfies TRPCRouterRecord;
