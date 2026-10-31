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

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { encryptPayload } from "@virtbase/utils";
import type { WebSocketData } from "@virtbase/validators";
import type { ServerWebSocket } from "bun";
import type { ServerOptions } from "../server";
import { startServer } from "../server";

/**
 * The proxy with real sockets: a real server, browser websockets, and a local
 * server standing in for the Proxmox node. The only thing swapped is the base
 * URL the proxy dials.
 */

const SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_SECRET =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const TICKET = "PVEAPIToken=root@pam!console=ticket-7f3a";
const VNCTICKET = "PVEVNC:6720F1A2::vncticket-91c2+/=";

type Frame = string | Buffer;

const consoleData = (
  overrides: Partial<WebSocketData> = {},
): WebSocketData => ({
  vmid: 1000,
  type: "qemu",
  host: "pve01.example.com",
  node: "pve01",
  ticket: TICKET,
  vncticket: VNCTICKET,
  port: 5900,
  serverId: "kvm_alice",
  userId: "usr_alice",
  exp: Math.floor(Date.now() / 1000) + 300,
  ...overrides,
});

const mint = (
  overrides: Partial<WebSocketData> = {},
  secret = SECRET,
): Promise<string> =>
  encryptPayload(JSON.stringify(consoleData(overrides)), secret);

const cleanups: (() => unknown)[] = [];
let logs: string[] = [];

beforeEach(() => {
  logs = [];
  for (const level of ["info", "warn", "error"] as const) {
    const spy = spyOn(console, level).mockImplementation(
      (...args: unknown[]) => {
        logs.push(args.join(" "));
      },
    );
    cleanups.push(() => spy.mockRestore());
  }
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const waitFor = async (
  condition: () => boolean,
  timeoutMs = 2_000,
): Promise<void> => {
  const deadline = performance.now() + timeoutMs;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("timed out waiting");
    await Bun.sleep(5);
  }
};

const startProxy = (options: Partial<ServerOptions> = {}) => {
  const proxy = startServer({ port: 0, secret: SECRET, ...options });
  cleanups.push(() => proxy.server.stop(true));
  const port = Number(proxy.server.url.port);
  return { ...proxy, port, address: `127.0.0.1:${port}` };
};

interface NodeConsole {
  path: string;
  query: Record<string, string>;
  authorization: string | null;
  received: Frame[];
  closed?: { code: number; reason: string };
}

/**
 * A Proxmox node that echoes every frame. A `held` node answers no handshake
 * until `release()`, which keeps the proxy dialling for as long as a test
 * needs.
 */
const startNode = ({ held = false } = {}) => {
  const gate = Promise.withResolvers<void>();
  if (!held) gate.resolve();
  const consoles: ServerWebSocket<NodeConsole>[] = [];

  const server = Bun.serve<NodeConsole>({
    port: 0,
    async fetch(request, server) {
      await gate.promise;
      const url = new URL(request.url);
      const data: NodeConsole = {
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        authorization: request.headers.get("authorization"),
        received: [],
      };
      return server.upgrade(request, { data })
        ? undefined
        : new Response(null, { status: 400 });
    },
    websocket: {
      open(ws) {
        consoles.push(ws);
      },
      message(ws, frame) {
        ws.data.received.push(frame);
        ws.send(frame);
      },
      close(ws, code, reason) {
        ws.data.closed = { code, reason };
      },
    },
  });
  cleanups.push(() => server.stop(true));

  return {
    url: `ws://127.0.0.1:${server.port}`,
    consoles,
    release: () => gate.resolve(),
  };
};

/**
 * A node at the TCP level. With `answer: false` it never finishes the
 * websocket handshake. With `answer: true` it finishes it, reads one frame and
 * then hangs: it stops reading, so a close never reaches it either.
 */
const startRawNode = ({ answer }: { answer: boolean }) => {
  const connections = { opened: 0, frames: 0, ended: 0 };
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open() {
        connections.opened += 1;
      },
      data(socket, data) {
        const key = /sec-websocket-key: *(\S+)/i.exec(data.toString())?.[1];
        if (!key) {
          connections.frames += 1;
          socket.pause();
          return;
        }
        if (!answer) return;
        const accept = new Bun.CryptoHasher("sha1")
          .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest("base64");
        socket.write(
          `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
        );
      },
      close() {
        connections.ended += 1;
      },
    },
  });
  cleanups.push(() => listener.stop(true));

  return { url: `ws://127.0.0.1:${listener.port}`, connections };
};

/** A port that was free a moment ago, so nothing answers on it. */
const closedPort = (): number => {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = listener;
  listener.stop(true);
  return port;
};

const openConsole = async (address: string, payload?: string) => {
  const ws = new WebSocket(
    `ws://${address}/?payload=${payload ?? (await mint())}`,
  );
  const received: Frame[] = [];
  ws.addEventListener("message", ({ data }: MessageEvent<Frame>) => {
    received.push(data);
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    ws.addEventListener("close", ({ code, reason }) =>
      resolve({ code, reason }),
    ),
  );
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("upgrade refused")), {
      once: true,
    });
  });
  return { ws, received, closed };
};

/**
 * A browser speaking websocket over a raw socket, for what Bun's own client
 * never sends: a close frame that carries no status code.
 */
const openRawConsole = async (port: number) => {
  const upgraded = Promise.withResolvers<void>();
  let response = "";
  const socket = await Bun.connect({
    hostname: "127.0.0.1",
    port,
    socket: {
      data(_socket, data) {
        response += data.toString("latin1");
        if (response.includes("\r\n\r\n")) upgraded.resolve();
      },
    },
  });
  cleanups.push(() => socket.end());

  socket.write(
    `GET /?payload=${await mint()} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
  );
  await upgraded.promise;
  expect(response).toStartWith("HTTP/1.1 101");

  return {
    // FIN + close opcode, masked as a client must, and an empty payload.
    closeWithoutStatus: () =>
      socket.write(new Uint8Array([0x88, 0x80, 0x01, 0x02, 0x03, 0x04])),
  };
};

const expectStillServing = async (address: string): Promise<void> => {
  const next = await openConsole(address);
  next.ws.send("still here");
  await waitFor(() => next.received.length === 1);
  expect(next.received).toEqual(["still here"]);
  next.ws.close(1000);
};

describe("HTTP", () => {
  test("reports its uptime in whole seconds", async () => {
    const { address } = startProxy();

    const response = await fetch(`http://${address}/api/status`);

    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/^\{"uptime":\d+\}$/);
  });

  test.each([
    ["POST", "/", 405, "Method not allowed. Supported methods: GET"],
    ["GET", "/", 400, "Missing payload"],
    ["GET", "/?payload=", 400, "Missing payload"],
  ])("answers %s %s with %p", async (method, path, status, error) => {
    const { address } = startProxy();

    const response = await fetch(`http://${address}${path}`, { method });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error, code: status, issues: [] });
  });

  test("answers every bad payload with the same 400", async () => {
    const { address } = startProxy();
    const now = Math.floor(Date.now() / 1000);
    const payloads = [
      "garbage",
      "00ff00ff00ff00ff00ff00ff00ff00ff:00ff00ff00ff00ff00ff00ff00ff00ff",
      await mint({}, OTHER_SECRET),
      await encryptPayload(JSON.stringify({ vmid: 1000 }), SECRET),
      await mint({ exp: now - 600 }),
      await mint({ exp: now + 86_400 }),
    ];

    const responses = await Promise.all(
      payloads.map(async (payload) => {
        const response = await fetch(`http://${address}/?payload=${payload}`);
        return { status: response.status, body: await response.text() };
      }),
    );

    for (const response of responses) {
      expect(response).toEqual({
        status: 400,
        body: '{"error":"Invalid payload","code":400,"issues":[]}',
      });
    }
  });

  test("asks for an upgrade when a valid payload arrives as plain HTTP", async () => {
    const { address } = startProxy();

    const response = await fetch(`http://${address}/?payload=${await mint()}`);

    expect(response.status).toBe(426);
    expect(await response.json()).toEqual({
      error: "Expected a websocket upgrade",
      code: 426,
      issues: [],
    });
  });
});

describe("bridging", () => {
  test("forwards frames unchanged both ways, to the node the payload names", async () => {
    const node = startNode();
    const { address } = startProxy({ upstreamBaseUrl: node.url });
    const browser = await openConsole(address);

    browser.ws.send("RFB 003.008\n");
    browser.ws.send(new Uint8Array([0, 1, 2, 255]));
    await waitFor(() => browser.received.length === 2);

    const frames = ["RFB 003.008\n", Buffer.from([0, 1, 2, 255])];
    expect(browser.received).toEqual(frames);
    expect(node.consoles[0]?.data).toEqual({
      path: "/api2/json/nodes/pve01/qemu/1000/vncwebsocket",
      query: { port: "5900", vncticket: VNCTICKET },
      authorization: TICKET,
      received: frames,
    });
  });

  test("holds up to 64 frames and 1 MiB sent before the node answers, in order", async () => {
    const node = startNode({ held: true });
    const { address } = startProxy({ upstreamBaseUrl: node.url });
    const browser = await openConsole(address);
    const frames = Array.from({ length: 64 }, (_, index) =>
      `${index}:`.padEnd(16 * 1024, "."),
    );

    for (const frame of frames) browser.ws.send(frame);
    // Long enough for every frame to reach the proxy while it is dialling.
    await Bun.sleep(50);
    node.release();
    await waitFor(() => browser.received.length === frames.length);

    expect(node.consoles[0]?.data.received).toEqual(frames);
    expect(browser.received).toEqual(frames);
  });

  test.each([
    ["a 65th frame", Array.from({ length: 65 }, () => "x")],
    ["one byte more than 1 MiB", ["x".repeat(1024 * 1024 + 1)]],
  ])(
    "closes a console that sends %s before the node answers",
    async (_, frames) => {
      const node = startNode({ held: true });
      const { address } = startProxy({ upstreamBaseUrl: node.url });
      const browser = await openConsole(address);

      for (const frame of frames) browser.ws.send(frame);

      expect(await browser.closed).toEqual({
        code: 1011,
        reason: "Upstream websocket not found",
      });
      node.release();
      await Bun.sleep(50);
      expect(node.consoles.flatMap((ws) => ws.data.received)).toEqual([]);
    },
  );

  test("keeps two consoles with the same vmid on different nodes apart", async () => {
    const node = startNode();
    const { address } = startProxy({ upstreamBaseUrl: node.url });
    const alice = await openConsole(address, await mint({ node: "pve01" }));
    const bob = await openConsole(
      address,
      await mint({ node: "pve02", serverId: "kvm_bob", userId: "usr_bob" }),
    );
    const at = (name: string) =>
      node.consoles.find(({ data }) => data.path.includes(`/nodes/${name}/`));

    alice.ws.send("alice-keystroke");
    bob.ws.send("bob-keystroke");
    await waitFor(() => alice.received.length + bob.received.length === 2);

    expect(alice.received).toEqual(["alice-keystroke"]);
    expect(bob.received).toEqual(["bob-keystroke"]);
    expect(at("pve01")?.data.received).toEqual(["alice-keystroke"]);
    expect(at("pve02")?.data.received).toEqual(["bob-keystroke"]);

    alice.ws.close(1000);
    await alice.closed;
    bob.ws.send("bob-still-typing");
    await waitFor(() => bob.received.length === 2);
    expect(at("pve02")?.data.closed).toBeUndefined();
  });

  test("passes the node's close code on to the browser", async () => {
    const node = startNode();
    const { address } = startProxy({ upstreamBaseUrl: node.url });
    const browser = await openConsole(address);
    await waitFor(() => node.consoles.length === 1);

    node.consoles[0]?.close(4000, "guest powered off");

    expect(await browser.closed).toEqual({
      code: 4000,
      reason: "Upstream websocket closed",
    });
  });

  test("passes the browser's close code and reason on to the node", async () => {
    const node = startNode();
    const { address } = startProxy({ upstreamBaseUrl: node.url });
    const browser = await openConsole(address);
    await waitFor(() => node.consoles.length === 1);

    browser.ws.close(4001, "tab closed");

    await waitFor(() => node.consoles[0]?.data.closed !== undefined);
    expect(node.consoles[0]?.data.closed).toEqual({
      code: 4001,
      reason: "tab closed",
    });
  });

  test("closes the node normally when the browser closes without a status, and keeps serving", async () => {
    const node = startNode();
    const proxy = startProxy({ upstreamBaseUrl: node.url });
    const raw = await openRawConsole(proxy.port);
    // Leaving while the proxy is still dialling takes another path.
    await waitFor(() => node.consoles.length === 1);

    raw.closeWithoutStatus();

    await waitFor(() => node.consoles[0]?.data.closed !== undefined);
    expect(node.consoles[0]?.data.closed).toEqual({ code: 1000, reason: "" });
    await expectStillServing(proxy.address);
  });

  test("closes the node as an error when the browser drops, and keeps serving", async () => {
    const node = startNode();
    const { address } = startProxy({ upstreamBaseUrl: node.url });
    const browser = await openConsole(address);
    await waitFor(() => node.consoles.length === 1);

    browser.ws.terminate();

    await waitFor(() => node.consoles[0]?.data.closed !== undefined);
    expect(node.consoles[0]?.data.closed).toEqual({ code: 1011, reason: "" });
    await expectStillServing(address);
  });

  test("refuses a console whose ticket cannot be sent, and keeps serving", async () => {
    // `new WebSocket()` throws for this header value, from inside a handler.
    const node = startNode();
    const { address } = startProxy({ upstreamBaseUrl: node.url });
    const browser = await openConsole(
      address,
      await mint({ ticket: "PVE:root@pam:6720F1A2::sig\r\nX-Injected: 1" }),
    );

    expect(await browser.closed).toEqual({
      code: 1011,
      reason: "Upstream websocket error",
    });
    await expectStillServing(address);
  });

  test("closes the console with 1011 when the node cannot be reached", async () => {
    const { address } = startProxy({
      upstreamBaseUrl: `ws://127.0.0.1:${closedPort()}`,
    });
    const browser = await openConsole(address);

    expect(await browser.closed).toEqual({
      code: 1011,
      reason: "Upstream websocket error",
    });
  });
});

describe("timeouts", () => {
  test("abandons the dial when the browser leaves first", async () => {
    const node = startRawNode({ answer: false });
    const { address } = startProxy({ upstreamBaseUrl: node.url });
    const browser = await openConsole(address);
    await waitFor(() => node.connections.opened === 1);

    browser.ws.close(1000);

    // Well inside the 15s the handshake would otherwise get.
    await waitFor(() => node.connections.ended === 1);
  });

  test("gives up on a node that never finishes the handshake", async () => {
    const node = startRawNode({ answer: false });
    const { address } = startProxy({
      upstreamBaseUrl: node.url,
      timeouts: { handshakeMs: 100 },
    });
    const browser = await openConsole(address);

    expect(await browser.closed).toEqual({
      code: 1011,
      reason: "Upstream websocket error",
    });
    await waitFor(() => node.connections.ended === 1);
  });

  test("gives a node that has stopped reading closeMs to catch up, then terminates it", async () => {
    const node = startRawNode({ answer: true });
    const { address } = startProxy({
      upstreamBaseUrl: node.url,
      timeouts: { closeMs: 500 },
    });
    const browser = await openConsole(address);
    // A frame only reaches the node once the proxy's side is open.
    browser.ws.send("hello");
    await waitFor(() => node.connections.frames === 1);
    // More than the kernel buffers hold, so some of it stays queued in the
    // proxy: a close sent now would never get out.
    const mebibyte = new Uint8Array(1024 * 1024);
    for (let index = 0; index < 32; index += 1) browser.ws.send(mebibyte);

    browser.ws.close(1000);

    await Bun.sleep(250);
    expect(node.connections.ended).toBe(0);
    await waitFor(() => node.connections.ended === 1);
  });
});

describe("shutdown", () => {
  test("closes every console as going away and stops accepting", async () => {
    const node = startNode();
    const proxy = startProxy({ upstreamBaseUrl: node.url });
    const browser = await openConsole(proxy.address);
    await waitFor(() => node.consoles.length === 1);

    await proxy.shutdown();

    expect(await browser.closed).toEqual({
      code: 1001,
      reason: "Server shutting down",
    });
    await waitFor(() => node.consoles[0]?.data.closed !== undefined);
    expect(node.consoles[0]?.data.closed).toEqual({
      code: 1001,
      reason: "Server shutting down",
    });
    await expect(fetch(`http://${proxy.address}/api/status`)).rejects.toThrow();
  });
});

describe("logging", () => {
  test("says why each console failed, without the secret, a ticket or a payload", async () => {
    const silent = startRawNode({ answer: false });
    const refusing = Bun.serve({
      port: 0,
      fetch: () => new Response(null, { status: 401 }),
    });
    cleanups.push(() => refusing.stop(true));
    const payloads: string[] = [];
    /** Opens a console through a proxy of its own and waits for it to end. */
    const endConsole = async (
      options: Partial<ServerOptions>,
      overrides: Partial<WebSocketData> = {},
      frames = 0,
    ): Promise<void> => {
      const payload = await mint(overrides);
      payloads.push(payload);
      const browser = await openConsole(startProxy(options).address, payload);
      for (let index = 0; index < frames; index += 1) browser.ws.send("x");
      await browser.closed;
    };

    const expired = await mint({ exp: 1 });
    payloads.push(expired);
    await fetch(`http://${startProxy().address}/?payload=${expired}`);
    await endConsole({ upstreamBaseUrl: `ws://127.0.0.1:${closedPort()}` });
    await endConsole({ upstreamBaseUrl: `ws://127.0.0.1:${refusing.port}` });
    await endConsole({
      upstreamBaseUrl: silent.url,
      timeouts: { handshakeMs: 50 },
    });
    await endConsole({ upstreamBaseUrl: silent.url }, {}, 65);
    await endConsole(
      { upstreamBaseUrl: silent.url },
      { ticket: "PVE:root@pam:ticket-7f3a\r\nX: 1" },
    );

    const [rejected, ...failures] = logs;
    expect(rejected).toBe("Rejected a console payload: expired");
    expect(failures).toHaveLength(5);
    for (const line of failures) {
      expect(line).toEndWith(
        "(server=kvm_alice user=usr_alice node=pve01 vmid=1000)",
      );
    }
    // Bun quotes the node URL in both connection errors.
    expect(
      logs.filter((line) => line.includes("vncticket=[redacted]")),
    ).toHaveLength(2);
    for (const line of logs) {
      for (const secret of [
        SECRET,
        "ticket-7f3a",
        "vncticket-91c2",
        ...payloads,
      ]) {
        expect(line).not.toContain(secret);
      }
    }
  });
});
