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

import { afterEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import type { Notification } from "@virtbase/ports";
import { WebhookNotificationChannel } from "../channel";

const channel = new WebhookNotificationChannel();

const notification = (target?: Record<string, unknown>): Notification => ({
  id: "ntfd_0000000000000000000000000",
  key: "abuse.case.opened",
  audience: { kind: "operator", targetId: "ntft_1" },
  severity: "critical",
  params: { title: "Case AB-1042 opened", body: "Outbound spam from 1.2.3.4" },
  url: "https://admin.virtbase.com/abuse/abus_1",
  groupKey: "abuse:abus_1",
  ...(target ? { target } : {}),
  occurredAt: new Date("2026-08-28T10:00:00.000Z"),
});

const originalFetch = globalThis.fetch;

interface Captured {
  url: string;
  headers: Headers;
  body: string;
}

const captureFetch = (status = 200) => {
  const calls: Captured[] = [];

  globalThis.fetch = (async (input: string, init: RequestInit) => {
    calls.push({
      url: String(input),
      headers: new Headers(init.headers),
      body: String(init.body),
    });
    return new Response("", { status });
  }) as unknown as typeof globalThis.fetch;

  return calls;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("WebhookNotificationChannel", () => {
  test("reaches operators only", async () => {
    expect(await channel.supports({ kind: "operator" })).toBe(true);
    // A customer-facing webhook is a different feature with different
    // authorisation; sharing one target type would let an operator's URL
    // receive another person's notifications.
    expect(await channel.supports({ kind: "user", userId: "usr_1" })).toBe(
      false,
    );
  });

  test("refuses a target with no endpoint", async () => {
    expect(channel.send(notification())).rejects.toThrow(/no endpoint URL/i);
  });

  test("posts the notification as JSON", async () => {
    const calls = captureFetch();

    await channel.send(notification({ url: "https://hooks.test/virtbase" }));

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://hooks.test/virtbase");

    const payload = JSON.parse(calls[0]?.body ?? "{}");
    expect(payload).toMatchObject({
      id: "ntfd_0000000000000000000000000",
      key: "abuse.case.opened",
      severity: "critical",
      title: "Case AB-1042 opened",
      body: "Outbound spam from 1.2.3.4",
      group_key: "abuse:abus_1",
      occurred_at: "2026-08-28T10:00:00.000Z",
    });
  });

  test("signs over the timestamp as well as the body", async () => {
    const calls = captureFetch();

    await channel.send(
      notification({
        url: "https://hooks.test/virtbase",
        signingSecret: "topsecret",
      }),
    );

    const call = calls[0];
    const timestamp = call?.headers.get("X-Virtbase-Timestamp");
    const signature = call?.headers.get("X-Virtbase-Signature");

    expect(timestamp).toBeString();

    // Recomputing it the way a receiver would is the whole point: a signature
    // over the body alone can be replayed a week later.
    const expected = createHmac("sha256", "topsecret")
      .update(`${timestamp}.${call?.body}`)
      .digest("hex");

    expect(signature).toBe(`sha256=${expected}`);
  });

  test("sends unsigned when no secret is configured", async () => {
    const calls = captureFetch();

    await channel.send(notification({ url: "https://hooks.test/virtbase" }));

    expect(calls[0]?.headers.get("X-Virtbase-Signature")).toBeNull();
    expect(calls[0]?.headers.get("X-Virtbase-Delivery")).toBe(
      "ntfd_0000000000000000000000000",
    );
  });

  test("fails loudly when the endpoint rejects the message", async () => {
    captureFetch(503);

    expect(
      channel.send(notification({ url: "https://hooks.test/virtbase" })),
    ).rejects.toThrow(/503/);
  });
});
