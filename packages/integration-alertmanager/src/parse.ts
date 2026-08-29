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

import type {
  InboundSignal,
  SignalSeverity,
  SignalSubject,
} from "@virtbase/ports";
import { InboundSignalSchema } from "@virtbase/validators";
import * as z from "zod";
import type { AlertmanagerSettings } from "./config";

/** The integration id, and therefore the `source` every signal carries. */
export const SOURCE = "alertmanager";

/**
 * Labels never carry more than this many entries into a signal.
 *
 * A runaway relabelling rule can attach a hundred of them, and the port is
 * explicit that labels are low-cardinality routing data rather than a payload.
 */
const MAX_LABELS = 30;

/**
 * The Alertmanager v4 webhook body, and Grafana's, which is the same shape
 * with extras.
 *
 * Deliberately permissive: everything optional is optional because a sender
 * that omits a field should lose that field, not have its whole batch
 * rejected at three in the morning.
 */
export const alertmanagerPayloadSchema = z.object({
  status: z.string().optional(),
  alerts: z
    .array(
      z.object({
        status: z.string().optional(),
        labels: z.record(z.string(), z.string()).default({}),
        annotations: z.record(z.string(), z.string()).default({}),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        generatorURL: z.string().optional(),
        fingerprint: z.string().optional(),
        /** Grafana only: the evaluated query values behind the alert. */
        values: z.record(z.string(), z.number()).optional(),
        valueString: z.string().optional(),
        dashboardURL: z.string().optional(),
        panelURL: z.string().optional(),
      }),
    )
    .default([]),
});

export type AlertmanagerPayload = z.output<typeof alertmanagerPayloadSchema>;

/**
 * The generic form: a signal as the port defines it, minus `source`.
 *
 * `source` is fixed to this integration rather than accepted from the body,
 * because it is half of the deduplication key. A poster that could choose it
 * could collide with, or overwrite, another poster's signals.
 */
export const genericPayloadSchema = z.union([
  InboundSignalSchema.omit({ source: true }),
  z.object({ signals: z.array(InboundSignalSchema.omit({ source: true })) }),
]);

const SEVERITIES: Record<string, SignalSeverity> = {
  critical: "critical",
  crit: "critical",
  error: "critical",
  page: "critical",
  warning: "warning",
  warn: "warning",
  info: "info",
  none: "info",
};

/** Signal types are dotted lowercase; alert names are CamelCase by convention. */
export const slugify = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const firstOf = (
  labels: Record<string, string>,
  ...keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = labels[key];
    if (value && value.length > 0) return value;
  }
  return undefined;
};

/**
 * What the alert is about.
 *
 * Ordered from unambiguous to inferred. A `virtbase_server_id` is the answer;
 * an address has to be resolved against the allocation table as it stood at
 * the time; a bare node is ours, not a customer's, and opens no case.
 */
export const subjectFromLabels = (
  labels: Record<string, string>,
): SignalSubject => {
  const serverId = firstOf(labels, "virtbase_server_id");
  if (serverId) return { kind: "server", value: serverId };

  const ip = firstOf(labels, "virtbase_ip");
  if (ip) return { kind: "ip", value: ip };

  const vmid = firstOf(labels, "virtbase_vmid");
  const node = firstOf(labels, "virtbase_node", "node", "instance");
  if (vmid && node) return { kind: "vm", value: vmid, node };

  const userId = firstOf(labels, "virtbase_user_id");
  if (userId) return { kind: "user", value: userId };

  if (node) return { kind: "node", value: node };

  return { kind: "none" };
};

const boundedLabels = (
  labels: Record<string, string>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(labels)
      .slice(0, MAX_LABELS)
      .map(([key, value]) => [key.slice(0, 64), value.slice(0, 500)]),
  );

/**
 * A stable identity for an alert that did not bring one.
 *
 * Alertmanager and Grafana both send a fingerprint, so this is the fallback
 * for a hand-rolled sender. The label set is what makes two firings "the same
 * alert", which is exactly what the fingerprint means upstream.
 */
const fingerprintFrom = (labels: Record<string, string>): string =>
  Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");

/**
 * Turns one Alertmanager or Grafana batch into signals.
 *
 * A `resolved` alert becomes a resolved signal rather than being dropped: it
 * is what lets a transient flood release the throttle it caused without an
 * operator.
 */
export const parseAlertmanagerPayload = (
  payload: AlertmanagerPayload,
  settings: Pick<AlertmanagerSettings, "defaultSeverity">,
): InboundSignal[] =>
  payload.alerts.map((alert) => {
    const labels = boundedLabels(alert.labels);
    const alertname = labels.alertname ?? "unnamed";

    const declared = labels.virtbase_type;
    const type =
      declared && /^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(declared)
        ? declared
        : `alert.${slugify(alertname) || "unnamed"}`;

    const severity =
      SEVERITIES[(labels.severity ?? "").toLowerCase()] ??
      settings.defaultSeverity;

    const startsAt = alert.startsAt ? new Date(alert.startsAt) : new Date();

    const body = [
      alert.annotations.description ?? alert.annotations.message,
      // Grafana's evaluated value, which is usually the whole story.
      alert.valueString,
      alert.generatorURL,
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      source: SOURCE,
      externalId: alert.fingerprint ?? fingerprintFrom(labels),
      type,
      state:
        "resolved" === (alert.status ?? payload.status) ? "resolved" : "firing",
      severity,
      subject: subjectFromLabels(labels),
      title:
        alert.annotations.summary ??
        alert.annotations.title ??
        labels.alertname ??
        type,
      ...(body ? { body } : {}),
      labels,
      occurredAt: Number.isNaN(startsAt.getTime()) ? new Date() : startsAt,
      raw: alert,
    } satisfies InboundSignal;
  });

/** Turns a generic body into signals, accepting one or a batch. */
export const parseGenericPayload = (
  payload: z.output<typeof genericPayloadSchema>,
): InboundSignal[] => {
  const many = "signals" in payload ? payload.signals : [payload];

  return many.map((signal) => ({ ...signal, source: SOURCE }));
};
