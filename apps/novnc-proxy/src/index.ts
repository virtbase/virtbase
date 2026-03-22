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

import { decryptPayload } from "@virtbase/utils";
import type { WebSocketData } from "@virtbase/validators";
import { WebsocketDataSchema } from "@virtbase/validators";
import z4 from "zod/v4";
import { constructWebsocketUrl } from "./utils/construct-websocket-url";

const PORT = process.env.PORT || 8443;
const NOVNC_PROXY_SECRET = process.env.NOVNC_PROXY_SECRET;

const sockets = new Map<number, WebSocket>();

export const server = Bun.serve({
  port: PORT,
  routes: {
    "/api/status": {
      GET: () => {
        return Response.json({
          uptime: Math.round(Bun.nanoseconds() / 1e9),
        });
      },
    },
  },
  async fetch(request, server) {
    if (request.method !== "GET") {
      return Response.json(
        {
          error: "Method not allowed. Supported methods: GET",
          code: 405,
          issues: [],
        },
        { status: 405 },
      );
    }

    try {
      const params = new URL(request.url).searchParams;
      const encryptedPayload = params.get("payload");

      if (!encryptedPayload) {
        return Response.json(
          {
            error: "Missing payload",
            code: 400,
            issues: [],
          },
          { status: 400 },
        );
      }

      if (!NOVNC_PROXY_SECRET) {
        throw new Error("NOVNC_PROXY_SECRET environment variable is not set.");
      }

      const decryptedPayload = await decryptPayload(
        encryptedPayload,
        NOVNC_PROXY_SECRET,
      );
      const json = JSON.parse(decryptedPayload);

      const data = await WebsocketDataSchema.parseAsync(json);

      server.upgrade(request, { data });

      return undefined;
    } catch (error) {
      // Prevent any crashes and hide the error to the client
      console.error(
        `An error occurred while trying to process a request:`,
        error,
      );

      if (error instanceof z4.ZodError) {
        return Response.json(
          {
            error: "Invalid payload",
            code: 400,
            issues: error.issues,
          },
          { status: 400 },
        );
      }

      return Response.json(
        {
          error: "Internal server error",
          code: 500,
          issues: [],
        },
        { status: 500 },
      );
    }
  },
  websocket: {
    perMessageDeflate: false,
    sendPings: false,
    data: {} as WebSocketData,
    message(ws, message) {
      const socket = sockets.get(ws.data.vmid);
      if (!socket) {
        console.error(
          `Received a message for VM ${ws.data.vmid} but no socket found. This should not happen.`,
        );
        ws.close(1011, "Upstream websocket not found");
        return;
      }

      // Forward the message to the upstream websocket
      socket.send(message);
    },
    async open(ws) {
      const { ticket, ...data } = ws.data;
      const url = constructWebsocketUrl(data);

      const headers = ticket.startsWith("PVEAPIToken=")
        ? {
            authorization: ticket,
          }
        : {
            authorization: `PVEAuthCookie=${ticket}`,
          };

      const pws = new WebSocket(url, { headers });

      pws.addEventListener("open", () => {
        sockets.set(ws.data.vmid, pws);
      });
      pws.addEventListener("message", ({ data }) => {
        ws.send(data);
      });
      pws.addEventListener("error", () => {
        ws.close(1011, "Upstream websocket error");
      });
      pws.addEventListener("close", ({ code }) => {
        ws.close(code, "Upstream websocket closed");
      });
    },
    close(ws, code, reason) {
      const socket = sockets.get(ws.data.vmid);
      if (socket) {
        // Socket may already be closed
        socket.close(code, reason);
        sockets.delete(ws.data.vmid);
      }
    },
  },
});

console.log(`> Server is running on port ${PORT}`);
