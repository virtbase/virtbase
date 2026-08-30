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

import { beforeAll, describe, expect, it } from "bun:test";
import { encryptPayload } from "@virtbase/utils";
import type { WebSocketData } from "@virtbase/validators";
import { WebsocketDataSchema } from "@virtbase/validators";

const SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const validData = (overrides: Partial<WebSocketData> = {}): WebSocketData => ({
  vmid: 1000,
  type: "qemu",
  host: "pve01.example.com",
  node: "pve01",
  ticket: "PVEAPIToken=test-token",
  vncticket: "vnc-ticket-123",
  port: 5900,
  serverId: "kvm_test",
  userId: "usr_test",
  exp: Math.floor(Date.now() / 1000) + 300,
  ...overrides,
});

describe("Server API", () => {
  beforeAll(() => {
    // Set test environment
    process.env.PORT = "8444";
    process.env.NOVNC_PROXY_SECRET = SECRET;
  });

  it("should return status endpoint with uptime", async () => {
    const { server } = await import("../index");

    try {
      const response = await fetch(
        `http://localhost:${process.env.PORT}/api/status`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );

      const data = await response.json();
      expect(data).toHaveProperty("uptime");
      // @ts-expect-error - unknown type
      expect(typeof data.uptime).toBe("number");
      // @ts-expect-error - unknown type
      expect(data.uptime).toBeGreaterThanOrEqual(0);
    } finally {
      server.stop();
    }
  });

  it("should reject non-GET requests", async () => {
    const { server } = await import("../index");

    try {
      const response = await fetch(
        `http://localhost:${process.env.PORT}/test`,
        {
          method: "POST",
        },
      );
      expect(response.status).toBe(405);

      const data = await response.json();
      // @ts-expect-error - unknown type
      expect(data.error).toBe("Method not allowed. Supported methods: GET");
      // @ts-expect-error - unknown type
      expect(data.code).toBe(405);
    } finally {
      server.stop();
    }
  });

  it("should reject requests without payload parameter", async () => {
    const { server } = await import("../index");

    try {
      const response = await fetch(`http://localhost:${process.env.PORT}/test`);
      expect(response.status).toBe(400);

      const data = await response.json();
      // @ts-expect-error - unknown type
      expect(data.error).toBe("Missing payload");
      // @ts-expect-error - unknown type
      expect(data.code).toBe(400);
    } finally {
      server.stop();
    }
  });

  it("should reject an expired payload before upgrading", async () => {
    const { server } = await import("../index");

    try {
      const payload = await encryptPayload(
        JSON.stringify(validData({ exp: Math.floor(Date.now() / 1000) - 600 })),
        SECRET,
      );

      const response = await fetch(
        `http://localhost:${process.env.PORT}/?payload=${payload}`,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Invalid payload",
        code: 400,
        issues: [],
      });
    } finally {
      server.stop();
    }
  });

  it("should reject a tampered payload", async () => {
    const { server } = await import("../index");

    try {
      const original = await encryptPayload(
        JSON.stringify(validData()),
        SECRET,
      );
      const [prefix, iv, body] = original.split(":") as [
        string,
        string,
        string,
      ];
      const bytes = Buffer.from(body, "hex");
      // biome-ignore lint/style/noNonNullAssertion: the buffer is non-empty
      bytes[0] = bytes[0]! ^ 0x01;

      const response = await fetch(
        `http://localhost:${process.env.PORT}/?payload=${prefix}:${iv}:${bytes.toString("hex")}`,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Invalid payload",
        code: 400,
        issues: [],
      });
    } finally {
      server.stop();
    }
  });

  it("should answer every bad payload identically", async () => {
    const { server } = await import("../index");

    try {
      const expired = await encryptPayload(
        JSON.stringify(validData({ exp: Math.floor(Date.now() / 1000) - 600 })),
        SECRET,
      );
      const wrongShape = await encryptPayload(
        JSON.stringify({ nonsense: true }),
        SECRET,
      );
      const undecryptable = await encryptPayload(
        JSON.stringify(validData()),
        "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
      );

      // Sequentially: `server.stop()` in the tests above is graceful, so only
      // the pooled keep-alive connection is still usable.
      const responses: (readonly [number, string])[] = [];
      for (const payload of [expired, wrongShape, undecryptable, "garbage"]) {
        const response = await fetch(
          `http://localhost:${process.env.PORT}/?payload=${payload}`,
        );
        responses.push([response.status, await response.text()] as const);
      }

      // A three-way oracle used to tell an attacker which part of a forgery
      // failed: schema errors came back as a 400 listing the offending fields,
      // decryption failures as a 500.
      for (const response of responses) {
        expect(response).toEqual(responses[0] as (typeof responses)[number]);
      }
      expect(responses[0]?.[0]).toBe(400);
    } finally {
      server.stop();
    }
  });
});

describe("WebSocket Data Validation", () => {
  it("should validate correct WebSocket data structure", async () => {
    const data = validData();

    const result = await WebsocketDataSchema.parseAsync(data);
    expect(result).toEqual(data);
  });

  it("should require an expiry", async () => {
    const { exp, ...withoutExpiry } = validData();

    const result = await WebsocketDataSchema.safeParseAsync(withoutExpiry);
    expect(result.success).toBe(false);
  });

  it("should require the session binding", async () => {
    const { serverId, userId, ...unbound } = validData();

    expect((await WebsocketDataSchema.safeParseAsync(unbound)).success).toBe(
      false,
    );
    expect(
      (await WebsocketDataSchema.safeParseAsync({ ...unbound, userId }))
        .success,
    ).toBe(false);
    expect(
      (await WebsocketDataSchema.safeParseAsync({ ...unbound, serverId }))
        .success,
    ).toBe(false);
  });

  it("should handle PVEAPIToken format", () => {
    const ticket = "PVEAPIToken=test-token";
    expect(ticket.startsWith("PVEAPIToken=")).toBe(true);
  });

  it("should handle PVEAuthCookie format", () => {
    const ticket = "test-cookie-value";
    const authHeader = `PVEAuthCookie=${ticket}`;
    expect(authHeader).toBe("PVEAuthCookie=test-cookie-value");
  });
});
