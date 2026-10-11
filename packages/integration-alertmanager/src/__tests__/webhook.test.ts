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
import {
  defineIntegration,
  IntegrationRegistry,
} from "@virtbase/integration-sdk";
import type { InboundSignal, SignalIntake } from "@virtbase/ports";
import alertmanager from "../index";

const TOKEN = "alertmanager-ingest-token-0123";

const FIRING = {
  version: "4",
  groupKey: "{}:{}",
  truncatedAlerts: 0,
  status: "firing",
  receiver: "virtbase",
  groupLabels: {},
  commonLabels: {},
  commonAnnotations: {},
  externalURL: "https://alertmanager.example.com",
  alerts: [
    {
      status: "firing",
      labels: {
        alertname: "VirtbaseOutboundPacketFlood",
        instance: "10.0.2.7",
      },
      annotations: { summary: "Outbound flood" },
      startsAt: "2026-10-11T00:00:00Z",
      endsAt: "0001-01-01T00:00:00Z",
      generatorURL: "https://prometheus.example.com/graph",
      fingerprint: "a1b2c3",
    },
  ],
};

/**
 * Serves the alerts webhook with `payloadFormat`, and a fake `signals` port
 * that records what it was handed.
 */
const serve = async (
  payloadFormat: "alertmanager" | "generic" = "alertmanager",
) => {
  const submitted: InboundSignal[][] = [];
  const pending: Promise<unknown>[] = [];
  const intake: SignalIntake = {
    id: "fake-signals",
    submit: async () => ({ signalId: "sig_fake", deduplicated: false }),
    submitMany: async (signals) => {
      submitted.push(signals);
      return signals.map(() => ({ signalId: "sig_fake", deduplicated: false }));
    },
  };
  const core = defineIntegration({
    id: "core-signals",
    name: "Core signals",
    description: "The signals port, faked.",
    category: "platform",
    internal: true,
    provides: { signals: () => intake },
  });
  const registry = new IntegrationRegistry({
    integrations: [alertmanager, core],
    config: {
      isEnabled: async () => true,
      settings: async () => ({ payloadFormat, defaultSeverity: "warning" }),
      secrets: async () => ({ ingestToken: TOKEN }),
    },
  });
  const resolved = await registry.resolveWebhook(
    "alertmanager",
    "alerts",
    "POST",
    {
      waitUntil: (promise) => pending.push(promise),
    },
  );
  if (!resolved) throw new Error("the alerts webhook is not mounted");
  const post = async (body: unknown, token: string | null = TOKEN) => {
    const response = await resolved.webhook.handler(
      new Request(
        "https://app.virtbase.test/api/integrations/alertmanager/alerts",
        {
          method: "POST",
          headers: token ? { authorization: `Bearer ${token}` } : {},
          body: typeof body === "string" ? body : JSON.stringify(body),
        },
      ),
      resolved.context,
    );
    await Promise.all(pending);
    return response;
  };
  return { post, submitted };
};

describe("the alerts webhook", () => {
  test("answers 404 without the bearer token, and to a wrong one", async () => {
    const { post, submitted } = await serve();

    expect((await post(FIRING, null)).status).toBe(404);
    expect((await post(FIRING, "wrong-token-of-another-length")).status).toBe(
      404,
    );
    expect(submitted).toEqual([]);
  });

  test("answers 400 to a body that is not JSON", async () => {
    const { post } = await serve();

    expect((await post("{not json")).status).toBe(400);
  });

  test("answers 400 to a payload that is not Alertmanager's", async () => {
    const { post } = await serve();

    expect((await post({ alerts: "none" })).status).toBe(400);
  });

  test("accepts a firing batch and hands its signals to the signals port", async () => {
    const { post, submitted } = await serve();

    const response = await post(FIRING);

    expect(await response.json()).toEqual({ accepted: 1 });
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.[0]).toMatchObject({ source: "alertmanager" });
  });

  test("refuses more than 200 alerts in one request", async () => {
    const { post } = await serve();
    const alerts = Array.from({ length: 201 }, (_, index) => ({
      ...FIRING.alerts[0],
      fingerprint: `f${index}`,
    }));

    expect((await post({ ...FIRING, alerts })).status).toBe(413);
  });

  test("answers 400 to a generic payload that is not a signal", async () => {
    const { post } = await serve("generic");

    expect((await post({ nothing: true })).status).toBe(400);
  });
});
