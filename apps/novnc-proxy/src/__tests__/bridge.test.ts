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

import { describe, expect, test } from "bun:test";
import type { WebSocketData } from "@virtbase/validators";
import { authorization, sendableCloseCode, upstreamUrl } from "../bridge.ts";

/**
 * The pure parts of the bridge. How it behaves with real sockets is in
 * `proxy.test.ts`.
 */

const consoleData = (
  overrides: Partial<WebSocketData> = {},
): WebSocketData => ({
  vmid: 4242,
  type: "qemu",
  host: "pve01.example.com",
  node: "pve07",
  ticket: "PVEAPIToken=root@pam!console=secret",
  vncticket: "PVEVNC:6720F1A2::sig+/=",
  port: 5901,
  serverId: "kvm_alice",
  userId: "usr_alice",
  exp: 1_767_225_900,
  ...overrides,
});

describe("sendableCloseCode", () => {
  test.each([1000, 1001, 1003, 1007, 1011, 1014, 3000, 4000, 4999])(
    "passes %p on unchanged",
    (code: number) => {
      expect(sendableCloseCode(code)).toBe(code);
    },
  );

  test("turns a close without a status into a normal close", () => {
    expect(sendableCloseCode(1005)).toBe(1000);
  });

  test.each([0, 999, 1004, 1006, 1015, 1016, 2999, 5000])(
    "turns %p, which close() refuses, into an internal error",
    (code: number) => {
      expect(sendableCloseCode(code)).toBe(1011);
    },
  );
});

describe("upstreamUrl", () => {
  test("points at the guest's vncwebsocket on the payload's host", () => {
    expect(upstreamUrl(consoleData()).href).toBe(
      "wss://pve01.example.com/api2/json/nodes/pve07/qemu/4242/vncwebsocket?port=5901&vncticket=PVEVNC%3A6720F1A2%3A%3Asig%2B%2F%3D",
    );
  });

  test("never carries the ticket", () => {
    expect(upstreamUrl(consoleData()).href).not.toContain("PVEAPIToken");
  });

  test("dials the base URL instead of the host when one is given", () => {
    const url = upstreamUrl(consoleData(), "ws://127.0.0.1:9000");

    expect(url.origin).toBe("ws://127.0.0.1:9000");
    expect(url.pathname).toBe("/api2/json/nodes/pve07/qemu/4242/vncwebsocket");
  });
});

describe("authorization", () => {
  test("sends an API token as it is", () => {
    expect(authorization("PVEAPIToken=root@pam!console=secret")).toBe(
      "PVEAPIToken=root@pam!console=secret",
    );
  });

  test("sends a session ticket as a PVEAuthCookie", () => {
    expect(authorization("PVE:root@pam:6720F1A2::sig")).toBe(
      "PVEAuthCookie=PVE:root@pam:6720F1A2::sig",
    );
  });
});
