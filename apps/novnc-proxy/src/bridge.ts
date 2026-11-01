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

import type { WebSocketData } from "@virtbase/validators";
import type { ServerWebSocket } from "bun";
import { log } from "./log.ts";

/** A websocket message as Bun hands it over, on either side of the bridge. */
export type Frame = string | Buffer<ArrayBuffer>;

/** The RFC 6455 close codes the proxy deals in. */
export const CloseCode = {
  Normal: 1000,
  GoingAway: 1001,
  /** Reported locally for a close frame that carried no status. */
  NoStatus: 1005,
  InternalError: 1011,
} as const;

/**
 * The close codes `close()` accepts. 1004 to 1006 and 1015 only describe a
 * connection locally, and the rest of the range is unassigned.
 */
const SENDABLE_CLOSE_CODES = [
  [1000, 1003],
  [1007, 1014],
  [3000, 4999],
] as const;

/** Bounded so a browser that talks before the node answers cannot grow the heap. */
const BacklogLimit = {
  frames: 64,
  bytes: 1024 * 1024,
} as const;

/**
 * Turns a close code one side reported into one the other side may be sent.
 *
 * `close()` throws for a code it may not send, and a throw inside a websocket
 * handler takes down the whole process, every console with it. Bun reports a
 * close frame without a status as 1005 and a dropped connection as 1006, so
 * both arrive here routinely.
 */
export const sendableCloseCode = (code: number): number => {
  if (code === CloseCode.NoStatus) return CloseCode.Normal;
  const sendable = SENDABLE_CLOSE_CODES.some(
    ([min, max]) => code >= min && code <= max,
  );
  return sendable ? code : CloseCode.InternalError;
};

/** The node's console endpoint. The ticket is never part of it. */
export const upstreamUrl = (
  { host, node, type, vmid, port, vncticket }: WebSocketData,
  baseUrl = `wss://${host}`,
): URL => {
  const url = new URL(
    `/api2/json/nodes/${node}/${type}/${vmid}/vncwebsocket`,
    baseUrl,
  );
  url.searchParams.set("port", String(port));
  url.searchParams.set("vncticket", vncticket);
  return url;
};

/** An API token is sent as it is; anything else is a session ticket. */
export const authorization = (ticket: string): string =>
  ticket.startsWith("PVEAPIToken=") ? ticket : `PVEAuthCookie=${ticket}`;

/** Bun's websocket errors quote the URL they failed to reach, vncticket and all. */
const redactVncticket = (message: string): string =>
  message.replace(/vncticket=[^&\s'"]*/g, "vncticket=[redacted]");

/**
 * `new WebSocket()` throws for a header value it will not send, such as a
 * ticket with a line break in it, and the error quotes that value. Thrown from
 * a websocket handler it would take down every console, so the error becomes
 * `undefined` and is never logged.
 */
const dial = (
  payload: WebSocketData,
  baseUrl: string | undefined,
): WebSocket | undefined => {
  try {
    return new WebSocket(upstreamUrl(payload, baseUrl), {
      headers: { authorization: authorization(payload.ticket) },
      perMessageDeflate: false,
    });
  } catch {
    return undefined;
  }
};

/**
 * Closes the node socket without letting a node that has stopped reading hold
 * it open.
 *
 * Bun ignores `terminate()` once a close is queued, and a close queued behind
 * data the node is not reading never goes out. So a node with data still
 * queued gets `closeMs` to take it, and is then closed if it has caught up or
 * terminated if it has not.
 */
const closeUpstream = (
  upstream: WebSocket,
  code: number,
  reason: string,
  closeMs: number,
): void => {
  const closeOrTerminate = (): void => {
    if (upstream.bufferedAmount === 0) {
      upstream.close(code, reason);
    } else {
      upstream.terminate();
    }
  };

  if (upstream.bufferedAmount === 0) {
    closeOrTerminate();
  } else {
    setTimeout(closeOrTerminate, closeMs).unref();
  }
};

const byteLength = (frame: Frame): number =>
  typeof frame === "string" ? Buffer.byteLength(frame) : frame.byteLength;

type BrowserSocket = ServerWebSocket<Bridge>;

type State =
  /** Accepted by `fetch`; Bun has not opened the browser socket yet. */
  | { status: "upgrading" }
  | {
      status: "dialling";
      browser: BrowserSocket;
      upstream: WebSocket;
      /** What the browser sent before the node answered, in order. */
      backlog: Frame[];
      handshake: Timer;
    }
  | { status: "open"; browser: BrowserSocket; upstream: WebSocket }
  | { status: "closed" };

export interface BridgeOptions {
  /** Dialled instead of `wss://<host>`. Tests point it at a local node. */
  upstreamBaseUrl?: string | undefined;
  /** How long the node gets for TCP, TLS and the websocket handshake. */
  handshakeMs: number;
  /** How long a node that has fallen behind gets to catch up before its close. */
  closeMs: number;
}

/**
 * One console: a browser websocket and the node websocket it is bridged to.
 *
 * Every connection gets a `Bridge` of its own as `ws.data`, and everything that
 * routes a frame lives on it. Nothing is keyed on `vmid`, which is only unique
 * per node: a map keyed on it once sent one customer's keystrokes to another
 * customer's console.
 */
export class Bridge {
  #state: State = { status: "upgrading" };
  readonly #payload: WebSocketData;
  readonly #options: BridgeOptions;

  constructor(payload: WebSocketData, options: BridgeOptions) {
    this.#payload = payload;
    this.#options = options;
  }

  /** The browser socket is open: dial the node. */
  open(browser: BrowserSocket): void {
    const upstream = dial(this.#payload, this.#options.upstreamBaseUrl);
    if (!upstream) {
      log("error", "Could not dial the node", this.#payload);
      this.#state = { status: "closed" };
      browser.close(CloseCode.InternalError, "Upstream websocket error");
      return;
    }

    upstream.addEventListener("open", () => this.#upstreamOpened());
    upstream.addEventListener("message", ({ data }: MessageEvent<Frame>) =>
      this.#upstreamMessage(data),
    );
    upstream.addEventListener("error", (event) => this.#upstreamFailed(event));
    upstream.addEventListener("close", ({ code }) =>
      this.close(code, "Upstream websocket closed"),
    );

    const handshake = setTimeout(() => {
      log(
        "warn",
        `Upstream websocket handshake timed out after ${this.#options.handshakeMs}ms`,
        this.#payload,
      );
      this.close(CloseCode.InternalError, "Upstream websocket error");
    }, this.#options.handshakeMs);

    this.#state = {
      status: "dialling",
      browser,
      upstream,
      backlog: [],
      handshake,
    };
  }

  /** A frame from the browser, which may speak before the node has answered. */
  receive(frame: Frame): void {
    const state = this.#state;
    if (state.status === "open") {
      state.upstream.send(frame);
      return;
    }
    if (state.status !== "dialling") return;

    state.backlog.push(frame);
    const bytes = state.backlog.reduce(
      (sum, held) => sum + byteLength(held),
      0,
    );
    if (
      state.backlog.length > BacklogLimit.frames ||
      bytes > BacklogLimit.bytes
    ) {
      log("warn", "Browser sent more than the backlog holds", this.#payload);
      this.close(CloseCode.InternalError, "Upstream websocket not found");
    }
  }

  /**
   * Ends the console on both sides, with the same code and reason.
   *
   * Every ending comes through here: the browser leaving, the node closing or
   * failing, a timeout, an overflow and a shutdown. Closing a socket that has
   * already closed does nothing, so it does not matter which side went first.
   */
  close(code: number, reason: string): void {
    const state = this.#state;
    // Before anything else: `browser.close()` runs Bun's close handler
    // synchronously, and that handler calls straight back in here.
    this.#state = { status: "closed" };
    if (state.status === "upgrading" || state.status === "closed") return;

    const sendable = sendableCloseCode(code);
    state.browser.close(sendable, reason);

    if (state.status === "dialling") {
      clearTimeout(state.handshake);
      // Abandons the dial: there is no handshake yet to close cleanly.
      state.upstream.terminate();
      return;
    }

    closeUpstream(state.upstream, sendable, reason, this.#options.closeMs);
  }

  #upstreamOpened(): void {
    const state = this.#state;
    if (state.status !== "dialling") return;

    clearTimeout(state.handshake);
    for (const frame of state.backlog) state.upstream.send(frame);
    this.#state = {
      status: "open",
      browser: state.browser,
      upstream: state.upstream,
    };
  }

  #upstreamMessage(frame: Frame): void {
    const state = this.#state;
    if (state.status === "open") state.browser.send(frame);
  }

  #upstreamFailed(event: Event): void {
    // Terminating an abandoned dial reports an error as well.
    if (this.#state.status === "closed") return;

    const message =
      event instanceof ErrorEvent ? redactVncticket(event.message) : "unknown";
    log("warn", `Upstream websocket error: ${message}`, this.#payload);
    this.close(CloseCode.InternalError, "Upstream websocket error");
  }
}
