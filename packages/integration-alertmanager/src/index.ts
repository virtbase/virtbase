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

import { defineIntegration } from "@virtbase/integration-sdk";
import { PAYLOAD_FORMATS, secretsSchema, settingsSchema } from "./config";
import { localizeAlertmanager } from "./localize";
import { handleAlertsRequest } from "./webhook";

export * from "./config";
export * from "./parse";

export default defineIntegration({
  id: "alertmanager",
  name: "Alertmanager",
  description:
    "Receives alerts from Prometheus Alertmanager or Grafana and turns them into abuse cases and operator notifications.",

  category: "abuse",
  icon: "alertmanager",
  author: "Virtbase",
  website: "https://prometheus.io/docs/alerting/latest/alertmanager/",
  docsUrl:
    "https://prometheus.io/docs/alerting/latest/configuration/#webhook_config",

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

  // Nothing. This integration receives rather than provides: alerts arrive on
  // its webhook and are submitted through the `signals` port it consumes.
  provides: {},

  webhooks: [
    {
      path: "alerts",
      methods: ["POST"],
      handler: handleAlertsRequest,
    },
  ],

  localize: localizeAlertmanager,

  /**
   * There is nothing to probe. The integration owns no outbound connection -
   * it waits to be called - so the only thing that could be wrong is
   * configuration, which the registry already validates and reports.
   */
  health: async () => ({ status: "ok", checkedAt: new Date() }),
});
