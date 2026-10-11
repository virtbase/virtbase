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

import { defineManifest } from "@virtbase/integration-sdk/manifest";
import * as z from "zod";

/** The body shapes the alerts webhook parses, one per value of `payloadFormat`. */
export const PAYLOAD_FORMATS = ["alertmanager", "grafana", "generic"] as const;

/** The installation's settings: the payload format and the fallback severity. */
export const settingsSchema = z.object({
  /**
   * Which shape the sender speaks.
   *
   * `grafana` is `alertmanager` plus the extras Grafana adds - it is a separate
   * option rather than sniffing, because guessing wrong on an alerting path
   * fails silently and at the worst possible moment.
   */
  payloadFormat: z.enum(PAYLOAD_FORMATS).default("alertmanager"),
  /**
   * The severity used when an alert carries no `severity` label.
   *
   * Defaults to `warning` rather than `critical`: an alert nobody labelled is
   * more often a rule somebody forgot to finish than an emergency.
   */
  defaultSeverity: z.enum(["info", "warning", "critical"]).default("warning"),
});

/** The installation's secrets: the bearer token every alerts request must carry. */
export const secretsSchema = z.object({
  /**
   * Sent as `Authorization: Bearer`. Required rather than optional - this
   * endpoint opens abuse cases, and an unauthenticated one would let anybody
   * suspend a customer.
   */
  ingestToken: z.string().min(16),
});
/**
 * Alertmanager's static half (ADR 0003). It provides no port: alerts arrive on
 * its webhook and go to the `signals` port it consumes.
 */
export const manifest = defineManifest({
  apiVersion: 2,
  id: "alertmanager",
  version: "2.0.0",
  name: "Alertmanager",
  description:
    "Receives alerts from Prometheus Alertmanager or Grafana and turns them into abuse cases and operator notifications.",
  category: "abuse",
  icon: "alertmanager",
  author: "Virtbase",
  links: {
    website: "https://prometheus.io/docs/alerting/latest/alertmanager/",
    providerDocs:
      "https://prometheus.io/docs/alerting/latest/configuration/#webhook_config",
  },
  docs: "./docs",
  requires: { apiVersion: "^2.0.0" },
  provides: [],
  settings: {
    schema: settingsSchema,
    fields: [
      {
        key: "payloadFormat",
        label: "Payload format",
        help: "Which shape the sender speaks. Grafana sends the Alertmanager shape with extras.",
        widget: "select",
        options: PAYLOAD_FORMATS.map((value) => ({ value, label: value })),
      },
      {
        key: "defaultSeverity",
        label: "Default severity",
        help: "Used when an alert carries no severity label.",
        widget: "select",
        options: ["info", "warning", "critical"].map((value) => ({
          value,
          label: value,
        })),
      },
    ],
  },
  secrets: {
    schema: secretsSchema,
    fields: [
      {
        key: "ingestToken",
        label: "Ingest token",
        help: "Sent as an Authorization bearer token. Generate one with `openssl rand -hex 32`.",
        widget: "password",
      },
    ],
  },
});
