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

import type { IntegrationWebhook } from "@virtbase/integration-sdk";
import { safeSecretCompare } from "@virtbase/utils";
import { collectPlatformMetrics } from "./collectors";
import type { PrometheusSecrets, PrometheusSettings } from "./config";
import { runtimeFor } from "./runtime";

type ScrapeWebhook = IntegrationWebhook<PrometheusSettings, PrometheusSecrets>;

/**
 * `GET /api/integrations/prometheus/metrics` — what Prometheus scrapes.
 *
 * The platform gauges are read from the database here rather than on a timer,
 * so a value is only ever computed because someone asked for it, and is exactly
 * as old as the scrape that carries it.
 */
export const handleScrapeRequest: ScrapeWebhook["handler"] = async (
  request,
  ctx,
) => {
  if (!isAuthorized(request, ctx.secrets.scrapeToken)) {
    // 404 rather than 401, matching the dispatcher: unknown, disabled and
    // misconfigured integrations all answer identically, and a 401 here would
    // confirm to an unauthenticated caller that this deployment has Prometheus
    // installed and where its endpoint is.
    return new Response("Not found.", { status: 404 });
  }

  const runtime = runtimeFor(ctx.settings);

  if (ctx.settings.collectPlatformMetrics) {
    // Never rejects: a database failure is reported as
    // `<prefix>platform_collector_up 0` inside the response body, so the
    // runtime metrics still reach Prometheus and the failure is itself
    // alertable.
    await collectPlatformMetrics(runtime, ctx.logger);
  }

  return new Response(await runtime.registry.metrics(), {
    status: 200,
    headers: {
      "content-type": runtime.registry.contentType,
      // A scrape is a point-in-time reading. Anything caching it would serve
      // Prometheus the same timestamped values twice.
      "cache-control": "no-store, max-age=0",
    },
  });
};

/**
 * Checks the bearer token Prometheus sends from `bearer_token` in its scrape
 * config, in constant time.
 */
function isAuthorized(request: Request, expected: string): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;

  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return false;

  return safeSecretCompare(rest.join(" ").trim(), expected);
}
