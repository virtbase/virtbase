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
  alertmanagerPayloadSchema,
  genericPayloadSchema,
  parseAlertmanagerPayload,
  parseGenericPayload,
  slugify,
  subjectFromLabels,
} from "../parse";

const settings = { defaultSeverity: "warning" } as const;

const parse = (body: unknown) =>
  parseAlertmanagerPayload(alertmanagerPayloadSchema.parse(body), settings);

/** A batch as Alertmanager's `webhook_config` actually posts it. */
const ALERTMANAGER_BATCH = {
  version: "4",
  groupKey: '{}:{alertname="VirtbaseOutboundPacketFlood"}',
  truncatedAlerts: 0,
  status: "firing",
  receiver: "virtbase",
  groupLabels: { alertname: "VirtbaseOutboundPacketFlood" },
  commonLabels: { severity: "critical" },
  commonAnnotations: {},
  externalURL: "https://alertmanager.example.com",
  alerts: [
    {
      status: "firing",
      labels: {
        alertname: "VirtbaseOutboundPacketFlood",
        severity: "critical",
        virtbase_type: "abuse.ddos",
        virtbase_vmid: "101",
        virtbase_node: "pve-01",
        job: "node",
      },
      annotations: {
        summary: "Outbound packet flood from VM 101",
        description: "62000 packets/s sustained for 3 minutes on tap101i0.",
      },
      startsAt: "2026-08-28T10:00:00.000Z",
      endsAt: "0001-01-01T00:00:00Z",
      generatorURL: "https://prometheus.example.com/graph?g0.expr=...",
      fingerprint: "a1b2c3d4e5f60718",
    },
  ],
};

/** Grafana's unified alerting webhook: the same shape with extras. */
const GRAFANA_BATCH = {
  receiver: "virtbase",
  status: "firing",
  orgId: 1,
  title: "[FIRING:1] OutboundSpam",
  message: "**Firing**",
  state: "alerting",
  alerts: [
    {
      status: "firing",
      labels: {
        alertname: "OutboundSpam",
        grafana_folder: "Abuse",
        severity: "warning",
        virtbase_ip: "203.0.113.5",
      },
      annotations: { summary: "Outbound SMTP spike" },
      startsAt: "2026-08-28T11:00:00Z",
      endsAt: "0001-01-01T00:00:00Z",
      generatorURL: "https://grafana.example.com/alerting/grafana/abc/view",
      fingerprint: "ffee0011",
      values: { B: 412 },
      valueString: "[ var='B' labels={} value=412 ]",
      dashboardURL: "https://grafana.example.com/d/abc",
      panelURL: "https://grafana.example.com/d/abc?viewPanel=2",
    },
  ],
};

describe("parseAlertmanagerPayload", () => {
  test("maps a real Alertmanager batch onto a signal", () => {
    const [signal] = parse(ALERTMANAGER_BATCH);

    expect(signal).toMatchObject({
      source: "alertmanager",
      externalId: "a1b2c3d4e5f60718",
      type: "abuse.ddos",
      state: "firing",
      severity: "critical",
      subject: { kind: "vm", value: "101", node: "pve-01" },
      title: "Outbound packet flood from VM 101",
    });
    expect(signal?.body).toContain("62000 packets/s");
    expect(signal?.occurredAt.toISOString()).toBe("2026-08-28T10:00:00.000Z");
  });

  test("maps a Grafana batch, including the evaluated value", () => {
    const [signal] = parse(GRAFANA_BATCH);

    expect(signal).toMatchObject({
      externalId: "ffee0011",
      severity: "warning",
      subject: { kind: "ip", value: "203.0.113.5" },
      title: "Outbound SMTP spike",
    });
    // The number that tripped the rule is usually the whole story.
    expect(signal?.body).toContain("value=412");
  });

  test("derives a type from the alert name when none is declared", () => {
    const [signal] = parse({
      alerts: [
        {
          labels: { alertname: "VirtbaseOutboundPacketFlood" },
          annotations: {},
          fingerprint: "x",
        },
      ],
    });

    expect(signal?.type).toBe("alert.virtbase_outbound_packet_flood");
  });

  test("ignores a declared type that is not a valid signal type", () => {
    // A typo in a label must not become an unroutable signal type.
    const [signal] = parse({
      alerts: [
        {
          labels: { alertname: "Thing", virtbase_type: "abuse:ddos" },
          annotations: {},
          fingerprint: "x",
        },
      ],
    });

    expect(signal?.type).toBe("alert.thing");
  });

  test("a resolved alert becomes a resolved signal", () => {
    // Dropping these would mean a transient flood never releases the throttle
    // it caused.
    const [signal] = parse({
      status: "resolved",
      alerts: [
        {
          status: "resolved",
          labels: { alertname: "Flood" },
          annotations: {},
          fingerprint: "x",
        },
      ],
    });

    expect(signal?.state).toBe("resolved");
  });

  test("falls back to the configured severity when the label is missing", () => {
    const [signal] = parse({
      alerts: [
        { labels: { alertname: "Thing" }, annotations: {}, fingerprint: "x" },
      ],
    });

    expect(signal?.severity).toBe("warning");
  });

  test("normalises the severity spellings alerting stacks use", () => {
    const [crit] = parse({
      alerts: [
        {
          labels: { alertname: "A", severity: "Page" },
          annotations: {},
          fingerprint: "1",
        },
      ],
    });
    const [warn] = parse({
      alerts: [
        {
          labels: { alertname: "B", severity: "WARN" },
          annotations: {},
          fingerprint: "2",
        },
      ],
    });

    expect(crit?.severity).toBe("critical");
    expect(warn?.severity).toBe("warning");
  });

  test("synthesises a stable id for a sender with no fingerprint", () => {
    const labels = { alertname: "Thing", instance: "pve-01" };

    const [first] = parse({ alerts: [{ labels, annotations: {} }] });
    const [second] = parse({
      // Same labels, different order: the same alert.
      alerts: [
        { labels: { instance: "pve-01", alertname: "Thing" }, annotations: {} },
      ],
    });

    expect(first?.externalId).toBe(second?.externalId as string);
    expect(first?.externalId).toContain("alertname=Thing");
  });

  test("survives an alert missing everything optional", () => {
    // A sender that omits a field should lose that field, not have the batch
    // rejected at three in the morning.
    const [signal] = parse({ alerts: [{ labels: {}, annotations: {} }] });

    expect(signal?.type).toBe("alert.unnamed");
    expect(signal?.title).toBe("alert.unnamed");
    expect(signal?.subject).toEqual({ kind: "none" });
  });

  test("caps the labels it carries through", () => {
    const labels = Object.fromEntries(
      Array.from({ length: 60 }, (_, index) => [`label_${index}`, "value"]),
    );

    const [signal] = parse({
      alerts: [{ labels, annotations: {}, fingerprint: "x" }],
    });

    expect(Object.keys(signal?.labels ?? {})).toHaveLength(30);
  });
});

describe("subjectFromLabels", () => {
  test("prefers the unambiguous server id", () => {
    expect(
      subjectFromLabels({
        virtbase_server_id: "kvm_1",
        virtbase_ip: "203.0.113.5",
        virtbase_vmid: "101",
        virtbase_node: "pve-01",
      }),
    ).toEqual({ kind: "server", value: "kvm_1" });
  });

  test("falls back through address, guest, account, node", () => {
    expect(subjectFromLabels({ virtbase_ip: "203.0.113.5" })).toEqual({
      kind: "ip",
      value: "203.0.113.5",
    });
    expect(
      subjectFromLabels({ virtbase_vmid: "101", instance: "pve-01" }),
    ).toEqual({ kind: "vm", value: "101", node: "pve-01" });
    expect(subjectFromLabels({ virtbase_user_id: "usr_1" })).toEqual({
      kind: "user",
      value: "usr_1",
    });
    expect(subjectFromLabels({ node: "pve-02" })).toEqual({
      kind: "node",
      value: "pve-02",
    });
  });

  test("a vmid without a node identifies nothing", () => {
    // The pair is what resolves; a vmid alone is ambiguous across the fleet.
    expect(subjectFromLabels({ virtbase_vmid: "101" })).toEqual({
      kind: "none",
    });
  });
});

describe("parseGenericPayload", () => {
  const signal = {
    externalId: "report-1",
    type: "abuse.spam",
    severity: "warning",
    subject: { kind: "ip", value: "203.0.113.7" },
    title: "Spam from 203.0.113.7",
    occurredAt: "2026-08-28T09:00:00Z",
  };

  test("accepts one signal", () => {
    const [parsed] = parseGenericPayload(genericPayloadSchema.parse(signal));

    expect(parsed).toMatchObject({
      source: "alertmanager",
      externalId: "report-1",
      type: "abuse.spam",
      state: "firing",
    });
  });

  test("accepts a batch", () => {
    const parsed = parseGenericPayload(
      genericPayloadSchema.parse({
        signals: [signal, { ...signal, externalId: "report-2" }],
      }),
    );

    expect(parsed).toHaveLength(2);
  });

  test("the sender cannot choose its own source", () => {
    // `source` is half the deduplication key; a poster that could set it could
    // collide with, or overwrite, another poster's signals.
    const [parsed] = parseGenericPayload(
      genericPayloadSchema.parse({ ...signal, source: "abuseipdb" }),
    );

    expect(parsed?.source).toBe("alertmanager");
  });

  test("rejects a malformed address rather than passing it down", () => {
    expect(
      genericPayloadSchema.safeParse({
        ...signal,
        subject: { kind: "ip", value: "not-an-address" },
      }).success,
    ).toBe(false);
  });
});

describe("slugify", () => {
  test("turns an alert name into a signal type segment", () => {
    expect(slugify("VirtbaseOutboundPacketFlood")).toBe(
      "virtbase_outbound_packet_flood",
    );
    expect(slugify("node-disk-pressure")).toBe("node_disk_pressure");
    expect(slugify("  Spaced  Out  ")).toBe("spaced_out");
  });
});
