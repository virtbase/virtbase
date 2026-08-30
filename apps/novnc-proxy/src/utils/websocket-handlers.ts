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

import type { WebSocketData } from "@virtbase/validators";
import { constructWebsocketUrl } from "./construct-websocket-url";

/**
 * The bridge between one browser websocket and one Proxmox websocket.
 *
 * Every piece of state here hangs off the individual connection. There is no
 * module-level registry, and in particular nothing keyed on `vmid`: a vmid is
 * unique per Proxmox node, not per cluster, so two customers on two different
 * nodes routinely hold the same one. Keying a shared map on it meant the second
 * console to open silently took ownership of the first one's upstream socket,
 * and the first customer's keystrokes went to a stranger's root console.
 *
 * The handlers are built by a factory that takes the upstream dialer, so the
 * routing can be exercised without a live Proxmox — the production wiring in
 * `index.ts` passes the real `WebSocket`.
 */

/**
 * Anything either side of the bridge can carry.
 *
 * `Bun.BufferSource` rather than the DOM's `ArrayBufferView`: this type is the
 * parameter of `ClientSocket.send`, and Bun's own `ServerWebSocket.send` takes
 * `string | BufferSource | Blob`. Parameters being contravariant, a wider
 * `Frame` is what stops a real `ServerWebSocket` from satisfying
 * `ClientSocket` - the DOM's structural `ArrayBufferView` is not one of the
 * concrete typed arrays Bun names, so the handlers no longer fit
 * `WebSocketHandler` at all.
 */
export type Frame = string | Bun.BufferSource;

/** Bounded so a client that talks before the upstream answers cannot grow the heap. */
const MAX_BUFFERED_FRAMES = 64;
const MAX_BUFFERED_BYTES = 1024 * 1024;

const frameSize = (frame: Frame): number =>
  typeof frame === "string" ? Buffer.byteLength(frame) : frame.byteLength;

export interface UpstreamSocket {
  send(data: Frame): unknown;
  close(code?: number, reason?: string): unknown;
}

export interface UpstreamListeners {
  onOpen(): void;
  onMessage(data: Frame): void;
  onError(): void;
  onClose(code: number): void;
}

export type ConnectUpstream = (
  url: URL,
  headers: Record<string, string>,
  listeners: UpstreamListeners,
) => UpstreamSocket;

/**
 * The per-connection slot Bun hands back on `ws.data`.
 *
 * `server.upgrade()` is given a freshly built one for every request, so two
 * connections cannot observe each other's `upstream` no matter what their
 * payloads say.
 */
export interface ConnectionData {
  readonly payload: WebSocketData;
  upstream: UpstreamSocket | null;
  /**
   * Whether the upstream handshake has completed. Separate from `upstream`
   * because the dialer returns a socket that is still CONNECTING, and sending
   * on one of those throws.
   */
  ready: boolean;
  buffered: Frame[];
  bufferedBytes: number;
  closed: boolean;
}

export const createConnectionData = (
  payload: WebSocketData,
): ConnectionData => ({
  payload,
  upstream: null,
  ready: false,
  buffered: [],
  bufferedBytes: 0,
  closed: false,
});

export interface ClientSocket {
  readonly data: ConnectionData;
  send(data: Frame): unknown;
  close(code?: number, reason?: string): unknown;
}

const authorizationHeader = (ticket: string): Record<string, string> =>
  ticket.startsWith("PVEAPIToken=")
    ? { authorization: ticket }
    : { authorization: `PVEAuthCookie=${ticket}` };

export const createWebsocketHandlers = ({
  connect,
}: {
  connect: ConnectUpstream;
}) => ({
  open(ws: ClientSocket): void {
    const state = ws.data;
    const { ticket, ...rest } = state.payload;
    const url = constructWebsocketUrl(rest);

    state.upstream = connect(url, authorizationHeader(ticket), {
      onOpen() {
        // The browser can hang up while we were still dialling. Nothing is
        // going to read this socket, so do not leave it open on the node.
        if (state.closed) {
          state.upstream?.close(1000, "Client disconnected");
          state.upstream = null;
          return;
        }

        state.ready = true;

        for (const frame of state.buffered) {
          state.upstream?.send(frame);
        }
        state.buffered = [];
        state.bufferedBytes = 0;
      },
      onMessage(data) {
        ws.send(data);
      },
      onError() {
        ws.close(1011, "Upstream websocket error");
      },
      onClose(code) {
        ws.close(code, "Upstream websocket closed");
      },
    });
  },

  message(ws: ClientSocket, message: Frame): void {
    const state = ws.data;
    if (state.closed) return;

    // `connect()` returns before the upstream handshake completes, so the
    // browser can legitimately speak first. Hold those frames in order rather
    // than dropping the connection, but only up to a bound — past that the peer
    // is not waiting on a handshake, it is filling memory.
    if (!state.ready || !state.upstream) {
      const size = frameSize(message);
      if (
        state.buffered.length >= MAX_BUFFERED_FRAMES ||
        state.bufferedBytes + size > MAX_BUFFERED_BYTES
      ) {
        console.error(
          `Client for VM ${state.payload.vmid} sent more than the buffer allows before the upstream opened.`,
        );
        // Stop accepting frames straight away. Bun still calls `close()`, which
        // is what tears the half-open upstream down.
        state.closed = true;
        state.buffered = [];
        state.bufferedBytes = 0;
        ws.close(1011, "Upstream websocket not found");
        return;
      }

      state.buffered.push(message);
      state.bufferedBytes += size;
      return;
    }

    state.upstream.send(message);
  },

  close(ws: ClientSocket, code: number, reason: string): void {
    const state = ws.data;
    state.closed = true;
    state.ready = false;
    state.buffered = [];
    state.bufferedBytes = 0;

    const upstream = state.upstream;
    if (upstream) {
      state.upstream = null;
      // Socket may already be closed
      upstream.close(code, reason);
    }
  },
});
