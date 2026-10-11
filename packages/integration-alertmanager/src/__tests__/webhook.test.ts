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
import type { AlertmanagerSettings } from "../config";
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

interface LogLine {
  level: string;
  message: string;
  fields: Record<string, unknown>;
}

/**
 * Serves the alerts webhook with `payloadFormat`, and a fake `signals` port
 * that records what it was handed, or rejects every batch with `failIngest`.
 */
const serve = async (
  payloadFormat: AlertmanagerSettings["payloadFormat"] = "alertmanager",
  { failIngest = false }: { failIngest?: boolean } = {},
) => {
  const submitted: InboundSignal[][] = [];
  const pending: Promise<unknown>[] = [];
  const logs: LogLine[] = [];
  const record =
    (level: string) => (message: string, fields: Record<string, unknown>) => {
      logs.push({ level, message, fields });
    };
  const intake: SignalIntake = {
    id: "fake-signals",
    submit: async () => ({ signalId: "sig_fake", deduplicated: false }),
    submitMany: async (signals) => {
      if (failIngest) throw new Error("signal store unavailable");
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
    logSink: {
      debug: record("debug"),
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
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
  return { post, submitted, logs };
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

  test("accepts a Grafana batch and carries its evaluated value into the signal", async () => {
    const { post, submitted } = await serve("grafana");
    const [alert] = FIRING.alerts;

    const response = await post({
      ...FIRING,
      alerts: [
        {
          ...alert,
          values: { A: 61234 },
          valueString: "[ var='A' labels={} value=61234 ]",
          dashboardURL: "https://grafana.example.com/d/abc",
          panelURL: "https://grafana.example.com/d/abc?viewPanel=2",
        },
      ],
    });

    expect(await response.json()).toEqual({ accepted: 1 });
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.[0]?.body).toContain("value=61234");
  });

  test("accepts a generic signal and fixes its source to the integration", async () => {
    const { post, submitted } = await serve("generic");

    const response = await post({
      externalId: "report-2026-10-11-001",
      type: "abuse.spam",
      severity: "warning",
      subject: { kind: "ip", value: "203.0.113.7" },
      title: "Spam from 203.0.113.7",
      occurredAt: "2026-10-11T00:00:00Z",
    });

    expect(await response.json()).toEqual({ accepted: 1 });
    expect(submitted[0]?.[0]).toMatchObject({
      source: "alertmanager",
      externalId: "report-2026-10-11-001",
      type: "abuse.spam",
    });
  });

  test("answers 200 and logs the failure when ingest fails after the response", async () => {
    const { post, logs } = await serve("alertmanager", { failIngest: true });

    const response = await post(FIRING);

    expect(response.status).toBe(200);
    expect(logs).toContainEqual({
      level: "error",
      message: "[integrations:alertmanager] Failed to ingest alerts",
      fields: {
        error: "signal store unavailable",
        count: 1,
        integration: "alertmanager",
      },
    });
  });

  test("hands the same alert over with the same external id when Alertmanager sends it twice", async () => {
    const { post, submitted } = await serve();

    await post(FIRING);
    await post(FIRING);

    expect(submitted).toHaveLength(2);
    const [first, second] = submitted.map((batch) => batch[0]?.externalId);
    expect(first).toBe("a1b2c3");
    expect(second).toBe(first);
  });

  test("answers 400 to a generic payload that is not a signal", async () => {
    const { post } = await serve("generic");

    expect((await post({ nothing: true })).status).toBe(400);
  });
});
