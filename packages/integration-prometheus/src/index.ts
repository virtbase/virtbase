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
import { collectPlatformMetrics } from "./collectors";
import {
  secretFields,
  secretsSchema,
  settingsFields,
  settingsSchema,
} from "./config";
import { localizePrometheus } from "./localize";
import { runtimeFor } from "./runtime";
import { PrometheusMetricsSink } from "./sink";
import { handleScrapeRequest } from "./webhook";

export * from "./collectors";
export * from "./config";
export * from "./names";
export * from "./runtime";
export * from "./sink";
export * from "./webhook";

export default defineIntegration({
  id: "prometheus",
  name: "Prometheus",
  description:
    "Exposes platform and runtime metrics on an authenticated scrape endpoint for Prometheus and Grafana.",

  category: "analytics",
  icon: "prometheus",
  author: "Virtbase",
  website: "https://prometheus.io",
  docsUrl:
    "https://prometheus.io/docs/prometheus/latest/configuration/configuration/#scrape_config",

  settings: {
    schema: settingsSchema,
    fields: settingsFields,
  },

  secrets: {
    schema: secretsSchema,
    fields: secretFields,
  },

  provides: {
    metrics: (ctx) =>
      new PrometheusMetricsSink(runtimeFor(ctx.settings), ctx.logger),
  },

  /**
   * The scrape endpoint is a webhook rather than a route of its own because it
   * is inbound HTTP that this integration owns: mounting it here means it
   * appears and disappears with the enable switch, and answers 404 when the
   * integration is off, without `apps/web` knowing Prometheus exists.
   */
  webhooks: [
    {
      path: "metrics",
      methods: ["GET"],
      handler: handleScrapeRequest,
    },
  ],

  localize: localizePrometheus,

  /**
   * There is no remote service to reach, so health is about whether this
   * deployment could actually answer a scrape: the registry has to serialise,
   * and the database has to answer if platform metrics are switched on.
   */
  health: async (ctx) => {
    const runtime = runtimeFor(ctx.settings);

    try {
      if (ctx.settings.collectPlatformMetrics) {
        const collected = await collectPlatformMetrics(runtime, ctx.logger);
        if (!collected) {
          return {
            status: "degraded",
            checkedAt: new Date(),
            message:
              "Platform metrics could not be read from the database. Runtime metrics are still being served.",
          };
        }
      }

      await runtime.registry.metrics();
      return { status: "ok", checkedAt: new Date() };
    } catch (error) {
      return {
        status: "error",
        checkedAt: new Date(),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
