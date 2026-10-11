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
import { localizePrometheus } from "./localize";
import { manifest } from "./manifest";
import { runtimeFor } from "./runtime";
import { PrometheusMetricsSink } from "./sink";
import { handleScrapeRequest } from "./webhook";

/** Prometheus's runtime (ADR 0003); its static half is `./manifest`. */
export default defineIntegration(manifest, {
  provides: {
    metrics: (ctx) =>
      new PrometheusMetricsSink(runtimeFor(ctx.settings), ctx.logger),
  },
  /**
   * The scrape endpoint is a webhook because it is inbound HTTP this
   * integration owns: it appears and disappears with the enable switch, and
   * answers 404 when the integration is off, without `apps/web` knowing
   * Prometheus exists.
   */
  webhooks: [
    { path: "metrics", methods: ["GET"], handler: handleScrapeRequest },
  ],
  /**
   * There is no remote service to reach, so health is whether this deployment
   * could answer a scrape: the registry has to serialise, and the
   * `platformMetrics` port has to answer when platform metrics are on.
   */
  health: {
    check: async (ctx) => {
      const runtime = runtimeFor(ctx.settings);
      if (
        ctx.settings.collectPlatformMetrics &&
        !(await collectPlatformMetrics(runtime, {
          reader: () => ctx.ports.require("platformMetrics"),
          logger: ctx.logger,
        }))
      ) {
        return {
          status: "degraded",
          checkedAt: new Date(),
          message:
            "Platform metrics could not be read from the database. Runtime metrics are still being served.",
        };
      }
      await runtime.registry.metrics();
      return { status: "ok", checkedAt: new Date() };
    },
  },
  localize: localizePrometheus,
});
