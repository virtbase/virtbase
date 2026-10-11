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
import { createHmac } from "node:crypto";
import type { FetchLike } from "@virtbase/integration-sdk";
import {
  createIntegrationHttp,
  createRedactor,
  IntegrationError,
} from "@virtbase/integration-sdk";
import { describeNotificationChannel } from "@virtbase/integration-testing/ports/notifications";
import type { Notification } from "@virtbase/ports";
import { WebhookNotificationChannel } from "../channel";

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

interface Captured {
  url: string;
  headers: Headers;
  body: string;
}

/** A channel on a fake endpoint that answers `status` and records each request. */
const channelOn = (status = 200, fetch?: FetchLike) => {
  const calls: Captured[] = [];
  const endpoint: FetchLike = async (input, init) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: String(init?.body),
    });
    return new Response("", { status });
  };
  const channel = new WebhookNotificationChannel(
    createIntegrationHttp({
      integrationId: "webhook",
      redactor: createRedactor([]),
      fetch: fetch ?? endpoint,
      sleep: async () => {},
    }),
  );
  return { channel, calls };
};

describe("WebhookNotificationChannel", () => {
  const { channel } = channelOn();

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
    await expect(channel.send(notification())).rejects.toMatchObject({
      code: "webhook.no_endpoint",
    });
  });

  test("posts the notification as JSON", async () => {
    const { channel, calls } = channelOn();

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
    const { channel, calls } = channelOn();

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
    const { channel, calls } = channelOn();

    await channel.send(notification({ url: "https://hooks.test/virtbase" }));

    expect(calls[0]?.headers.get("X-Virtbase-Signature")).toBeNull();
    expect(calls[0]?.headers.get("X-Virtbase-Delivery")).toBe(
      "ntfd_0000000000000000000000000",
    );
  });

  test("rejects a 5xx answer as retryable, without the endpoint's body", async () => {
    const { channel } = channelOn(503);

    const error = await channel
      .send(notification({ url: "https://hooks.test/virtbase" }))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({
      code: "webhook.endpoint_rejected",
      retryable: true,
      message: "The endpoint answered 503",
    });
  });

  test("rejects a 4xx answer as not retryable", async () => {
    const { channel } = channelOn(410);

    await expect(
      channel.send(notification({ url: "https://hooks.test/virtbase" })),
    ).rejects.toMatchObject({ retryable: false });
  });

  test("redacts the endpoint URL and the signing secret when the endpoint is unreachable", async () => {
    const { channel } = channelOn(200, async () => {
      throw new Error(
        "connect failed for https://hooks.slack.test/services/T1/B2/token-3 signed topsecret",
      );
    });

    const error = await channel
      .send(
        notification({
          url: "https://hooks.slack.test/services/T1/B2/token-3",
          signingSecret: "topsecret",
        }),
      )
      .catch((caught: unknown) => caught);

    const text =
      error instanceof Error ? `${error.message} ${String(error.cause)}` : "";
    expect(text).not.toContain("token-3");
    expect(text).not.toContain("topsecret");
  });
});

describeNotificationChannel("Outgoing webhooks", async () => {
  let delivered = 0;
  let failNext = false;
  const { channel } = channelOn(200, async () => {
    if (failNext) {
      failNext = false;
      return new Response("", { status: 500 });
    }
    delivered++;
    return new Response("", { status: 200 });
  });
  return {
    channel,
    supported: [{ kind: "operator" }],
    unsupported: [{ kind: "user", userId: "usr_contract" }],
    target: {
      url: "https://hooks.test/contract",
      signingSecret: "contract-signing-secret",
    },
    secrets: [],
    deliveries: () => delivered,
    failNextDelivery: () => {
      failNext = true;
    },
  };
});
