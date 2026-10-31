/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { Server } from "bun";
import type { BridgeOptions } from "./bridge.ts";
import { Bridge, CloseCode } from "./bridge.ts";
import type { Config } from "./config.ts";
import { log } from "./log.ts";
import { verifyPayload } from "./payload.ts";

export const Timeouts = {
  /** The node's TCP, TLS and websocket handshake. */
  handshakeMs: 15_000,
  /** A node that has fallen behind catching up, before it is terminated. */
  closeMs: 5_000,
  /** Open consoles finishing their close once a shutdown has begun. */
  drainMs: 10_000,
} as const;

export interface ServerOptions
  extends Config,
    Pick<BridgeOptions, "upstreamBaseUrl"> {
  /** Shorter timeouts, for tests that wait on them. */
  timeouts?: { [Key in keyof typeof Timeouts]?: number };
}

export interface ProxyServer {
  server: Server<Bridge>;
  /** Stops accepting, closes every console as going away and waits for them. */
  shutdown(): Promise<void>;
}

const failure = (status: number, error: string): Response =>
  Response.json({ error, code: status, issues: [] }, { status });

export const startServer = ({
  port,
  secret,
  upstreamBaseUrl,
  timeouts,
}: ServerOptions): ProxyServer => {
  const { handshakeMs, closeMs, drainMs } = { ...Timeouts, ...timeouts };
  // Only so a shutdown can reach every console: Bun has no call that closes
  // websockets with a code. Nothing is routed through it.
  const bridges = new Set<Bridge>();

  const server = Bun.serve<Bridge>({
    port,
    // Bun's development error page quotes the error, so never serve it.
    development: false,
    async fetch(request, server) {
      if (request.method !== "GET") {
        return failure(405, "Method not allowed. Supported methods: GET");
      }

      const url = new URL(request.url);
      if (url.pathname === "/api/status") {
        return Response.json({ uptime: Math.floor(process.uptime()) });
      }

      const payload = url.searchParams.get("payload");
      if (!payload) return failure(400, "Missing payload");

      const verified = await verifyPayload(payload, secret);
      if (!verified.ok) {
        log("warn", `Rejected a console payload: ${verified.reason}`);
        return failure(400, "Invalid payload");
      }

      const bridge = new Bridge(verified.data, {
        upstreamBaseUrl,
        handshakeMs,
        closeMs,
      });
      return server.upgrade(request, { data: bridge })
        ? undefined
        : failure(426, "Expected a websocket upgrade");
    },
    websocket: {
      perMessageDeflate: false,
      sendPings: false,
      open(ws) {
        bridges.add(ws.data);
        ws.data.open(ws);
      },
      message(ws, frame) {
        ws.data.receive(frame);
      },
      close(ws, code, reason) {
        bridges.delete(ws.data);
        ws.data.close(code, reason);
      },
    },
  });

  const shutdown = async (): Promise<void> => {
    // Resolves once the last open connection has closed.
    const stopped = server.stop();
    for (const bridge of bridges) {
      bridge.close(CloseCode.GoingAway, "Server shutting down");
    }

    const drained = await Promise.race([
      stopped.then(() => true),
      Bun.sleep(drainMs).then(() => false),
    ]);
    if (drained) return;

    log("warn", `Open consoles did not close within ${drainMs}ms`);
    await server.stop(true);
  };

  return { server, shutdown };
};
