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

import { describe, expect, test } from "bun:test";
import type { WebSocketData } from "@virtbase/validators";
import type {
  ClientSocket,
  ConnectUpstream,
  Frame,
  UpstreamListeners,
} from "../utils/websocket-handlers";
import {
  createConnectionData,
  createWebsocketHandlers,
} from "../utils/websocket-handlers";

const payload = (overrides: Partial<WebSocketData> = {}): WebSocketData => ({
  vmid: 1000,
  type: "qemu",
  host: "pve01.example.com",
  node: "pve01",
  ticket: "PVEAPIToken=user@pve!console=secret",
  vncticket: "vnc-ticket",
  port: 5900,
  serverId: "kvm_alice",
  userId: "usr_alice",
  exp: 1_767_225_900,
  ...overrides,
});

class FakeUpstream {
  readonly sent: Frame[] = [];
  readonly closes: { code?: number; reason?: string }[] = [];

  constructor(
    readonly url: URL,
    readonly headers: Record<string, string>,
    readonly listeners: UpstreamListeners,
  ) {}

  send(data: Frame) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closes.push({ code, reason });
  }
}

class FakeClient implements ClientSocket {
  readonly received: Frame[] = [];
  readonly closes: { code?: number; reason?: string }[] = [];

  constructor(readonly data: ReturnType<typeof createConnectionData>) {}

  send(frame: Frame) {
    this.received.push(frame);
  }

  close(code?: number, reason?: string) {
    this.closes.push({ code, reason });
  }
}

const harness = () => {
  const upstreams: FakeUpstream[] = [];

  const connect: ConnectUpstream = (url, headers, listeners) => {
    const upstream = new FakeUpstream(url, headers, listeners);
    upstreams.push(upstream);
    return upstream;
  };

  const handlers = createWebsocketHandlers({ connect });

  const openClient = (data: WebSocketData) => {
    const client = new FakeClient(createConnectionData(data));
    handlers.open(client);
    // biome-ignore lint/style/noNonNullAssertion: open() always dials
    const upstream = upstreams.at(-1)!;
    return { client, upstream };
  };

  return { handlers, upstreams, openClient };
};

describe("two connections that share a vmid", () => {
  // A vmid is unique per Proxmox node, not per cluster
  // (`d.unique().on(proxmoxNodeId, vmid)`), so two customers on two nodes hold
  // the same one routinely. The proxy used to key a module-level socket map on
  // vmid alone, which handed the second connection ownership of the first's
  // upstream: customer A's keystrokes were forwarded into customer B's VM.
  const alice = payload({
    vmid: 1000,
    node: "pve01",
    host: "pve01.example.com",
    serverId: "kvm_alice",
    userId: "usr_alice",
  });
  const bob = payload({
    vmid: 1000,
    node: "pve02",
    host: "pve02.example.com",
    serverId: "kvm_bob",
    userId: "usr_bob",
  });

  test("each gets its own upstream", () => {
    const { openClient } = harness();

    const a = openClient(alice);
    const b = openClient(bob);

    expect(a.upstream).not.toBe(b.upstream);
    expect(a.upstream.url.host).toBe("pve01.example.com");
    expect(b.upstream.url.host).toBe("pve02.example.com");
  });

  test("client frames only reach their own upstream", () => {
    const { handlers, openClient } = harness();

    const a = openClient(alice);
    const b = openClient(bob);
    a.upstream.listeners.onOpen();
    b.upstream.listeners.onOpen();

    handlers.message(a.client, "alice-keystroke");
    handlers.message(b.client, "bob-keystroke");

    expect(a.upstream.sent).toEqual(["alice-keystroke"]);
    expect(b.upstream.sent).toEqual(["bob-keystroke"]);
  });

  test("upstream frames only reach their own client", () => {
    const { openClient } = harness();

    const a = openClient(alice);
    const b = openClient(bob);
    a.upstream.listeners.onOpen();
    b.upstream.listeners.onOpen();

    a.upstream.listeners.onMessage("alice-screen");
    b.upstream.listeners.onMessage("bob-screen");

    expect(a.client.received).toEqual(["alice-screen"]);
    expect(b.client.received).toEqual(["bob-screen"]);
  });

  test("closing one leaves the other connected", () => {
    const { handlers, openClient } = harness();

    const a = openClient(alice);
    const b = openClient(bob);
    a.upstream.listeners.onOpen();
    b.upstream.listeners.onOpen();

    handlers.close(a.client, 1000, "done");

    expect(a.upstream.closes).toEqual([{ code: 1000, reason: "done" }]);
    expect(b.upstream.closes).toEqual([]);

    handlers.message(b.client, "still-typing");
    expect(b.upstream.sent).toEqual(["still-typing"]);
    expect(b.client.closes).toEqual([]);
  });

  test("an upstream failure only tears down its own client", () => {
    const { openClient } = harness();

    const a = openClient(alice);
    const b = openClient(bob);
    a.upstream.listeners.onOpen();
    b.upstream.listeners.onOpen();

    a.upstream.listeners.onError();

    expect(a.client.closes).toHaveLength(1);
    expect(b.client.closes).toEqual([]);
  });

  test("one customer's two browser tabs stay independent", () => {
    const { handlers, openClient } = harness();

    const first = openClient(alice);
    const second = openClient(alice);
    first.upstream.listeners.onOpen();
    second.upstream.listeners.onOpen();

    handlers.message(first.client, "tab-one");
    handlers.close(second.client, 1000, "closed the tab");

    expect(first.upstream.sent).toEqual(["tab-one"]);
    expect(first.upstream.closes).toEqual([]);
    expect(second.upstream.sent).toEqual([]);
  });
});

describe("upstream handshake race", () => {
  test("frames sent before the upstream opens are held and flushed in order", () => {
    const { handlers, openClient } = harness();
    const { client, upstream } = openClient(payload());

    handlers.message(client, "one");
    handlers.message(client, "two");
    expect(upstream.sent).toEqual([]);
    expect(client.closes).toEqual([]);

    upstream.listeners.onOpen();

    expect(upstream.sent).toEqual(["one", "two"]);

    handlers.message(client, "three");
    expect(upstream.sent).toEqual(["one", "two", "three"]);
  });

  test("a client that floods before the upstream opens is dropped", () => {
    const { handlers, openClient } = harness();
    const { client, upstream } = openClient(payload());

    for (let index = 0; index < 200; index += 1) {
      handlers.message(client, `frame-${index}`);
    }

    expect(client.closes).not.toEqual([]);
    expect(client.closes[0]?.code).toBe(1011);
    expect(upstream.sent).toEqual([]);
  });

  test("a client that hangs up while dialling does not leave the upstream open", () => {
    const { handlers, openClient } = harness();
    const { client, upstream } = openClient(payload());

    handlers.close(client, 1000, "gave up");
    upstream.listeners.onOpen();

    expect(upstream.closes).toHaveLength(1);
    expect(upstream.sent).toEqual([]);
  });
});

describe("upstream dialling", () => {
  test("builds the node URL from the payload", () => {
    const { openClient } = harness();
    const { upstream } = openClient(
      payload({ node: "pve07", vmid: 4242, port: "5901" }),
    );

    expect(upstream.url.toString()).toBe(
      "wss://pve01.example.com/api2/json/nodes/pve07/qemu/4242/vncwebsocket?port=5901&vncticket=vnc-ticket",
    );
  });

  test("passes an API token straight through", () => {
    const { openClient } = harness();
    const { upstream } = openClient(payload({ ticket: "PVEAPIToken=abc" }));

    expect(upstream.headers).toEqual({ authorization: "PVEAPIToken=abc" });
  });

  test("wraps a cookie ticket", () => {
    const { openClient } = harness();
    const { upstream } = openClient(payload({ ticket: "PVE:root@pam:abc" }));

    expect(upstream.headers).toEqual({
      authorization: "PVEAuthCookie=PVE:root@pam:abc",
    });
  });

  test("never puts the ticket in the upstream URL", () => {
    const { openClient } = harness();
    const { upstream } = openClient(payload());

    expect(upstream.url.toString()).not.toContain("PVEAPIToken");
  });
});
