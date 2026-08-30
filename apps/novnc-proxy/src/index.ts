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

import { InvalidPayloadError, verifyPayload } from "./utils/verify-payload";
import type {
  ConnectionData,
  ConnectUpstream,
  Frame,
} from "./utils/websocket-handlers";
import {
  createConnectionData,
  createWebsocketHandlers,
} from "./utils/websocket-handlers";

const PORT = process.env.PORT || 8443;
const NOVNC_PROXY_SECRET = process.env.NOVNC_PROXY_SECRET;

/** Production wiring: a real websocket to the Proxmox node. */
const connectUpstream: ConnectUpstream = (url, headers, listeners) => {
  const pws = new WebSocket(url, { headers });

  pws.addEventListener("open", () => listeners.onOpen());
  pws.addEventListener("message", ({ data }) =>
    listeners.onMessage(data as Frame),
  );
  pws.addEventListener("error", () => listeners.onError());
  pws.addEventListener("close", ({ code }) => listeners.onClose(code));

  return pws;
};

const handlers = createWebsocketHandlers({ connect: connectUpstream });

/**
 * One generic refusal for every way a payload can be bad.
 *
 * Tampering, an outdated schema and an expired ticket all look identical from
 * outside, so probing the endpoint tells an attacker nothing about which part
 * of their forgery failed.
 */
const invalidPayload = () =>
  Response.json(
    {
      error: "Invalid payload",
      code: 400,
      issues: [],
    },
    { status: 400 },
  );

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
        // A misconfigured proxy, not a bad request. Kept distinct from the
        // payload failures because it says nothing about the payload.
        console.error("NOVNC_PROXY_SECRET environment variable is not set.");
        return Response.json(
          {
            error: "Internal server error",
            code: 500,
            issues: [],
          },
          { status: 500 },
        );
      }

      let payload: Awaited<ReturnType<typeof verifyPayload>>;
      try {
        payload = await verifyPayload({
          payload: encryptedPayload,
          secret: NOVNC_PROXY_SECRET,
        });
      } catch (error) {
        console.error(
          "Rejected a console payload:",
          error instanceof InvalidPayloadError ? error.reason : error,
        );
        return invalidPayload();
      }

      server.upgrade(request, { data: createConnectionData(payload) });

      return undefined;
    } catch (error) {
      // Prevent any crashes and hide the error to the client
      console.error(
        `An error occurred while trying to process a request:`,
        error,
      );

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
    data: {} as ConnectionData,
    ...handlers,
  },
});

console.log(`> Server is running on port ${PORT}`);
