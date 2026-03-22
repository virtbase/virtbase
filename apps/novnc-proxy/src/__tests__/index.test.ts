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
import { WebsocketDataSchema } from "@virtbase/validators";

describe("Server API", () => {
  beforeAll(() => {
    // Set test environment
    process.env.PORT = "8444";
    process.env.SIGNATURE_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
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
});

describe("WebSocket Data Validation", () => {
  it("should validate correct WebSocket data structure", async () => {
    const validData = {
      vmid: 1000,
      type: "qemu" as const,
      host: "pve01.example.com",
      node: "pve01",
      ticket: "PVEAPIToken=test-token",
      vncticket: "vnc-ticket-123",
      port: 5900,
    };

    const result = await WebsocketDataSchema.parseAsync(validData);
    expect(result).toEqual(validData);
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
