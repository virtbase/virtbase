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
import type { InboundSignal } from "@virtbase/ports";
import { safeSecretCompare } from "@virtbase/utils";
import type { AlertmanagerSecrets, AlertmanagerSettings } from "./config";
import {
  alertmanagerPayloadSchema,
  genericPayloadSchema,
  parseAlertmanagerPayload,
  parseGenericPayload,
} from "./parse";

type AlertsWebhook = IntegrationWebhook<
  AlertmanagerSettings,
  AlertmanagerSecrets
>;

/** How many alerts one request may carry. Alertmanager batches by group. */
const MAX_ALERTS = 200;

/**
 * `POST /api/integrations/alertmanager/alerts` — where the alerting stack
 * hands us its verdicts.
 *
 * Detection is not our job: polling every server for traffic anomalies would
 * cost more than it catches, and Prometheus is already watching. This endpoint
 * is the other half of that decision.
 */
export const handleAlertsRequest: AlertsWebhook["handler"] = async (
  request,
  ctx,
) => {
  if (!isAuthorized(request, ctx.secrets.ingestToken)) {
    // 404 rather than 401, matching the Prometheus scrape endpoint and the
    // webhook dispatcher: a 401 would confirm to an unauthenticated caller
    // that this deployment ingests alerts, and where.
    return new Response("Not found.", { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Malformed JSON.", { status: 400 });
  }

  let signals: InboundSignal[];

  if ("generic" === ctx.settings.payloadFormat) {
    const parsed = genericPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid signal.", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    signals = parseGenericPayload(parsed.data);
  } else {
    const parsed = alertmanagerPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid alert payload.", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    signals = parseAlertmanagerPayload(parsed.data, ctx.settings);
  }

  if (0 === signals.length) return Response.json({ accepted: 0 });

  if (signals.length > MAX_ALERTS) {
    return Response.json(
      { error: `At most ${MAX_ALERTS} alerts per request.` },
      { status: 413 },
    );
  }

  const intake = await ctx.ports.require("signals");

  // Alertmanager's own timeout is short and it retries on anything but a 2xx,
  // so the acknowledgement goes out now and the pipeline finishes afterwards.
  // A retry is harmless: ingest is an upsert keyed on the fingerprint.
  ctx.waitUntil(
    intake.submitMany(signals).catch((error: unknown) => {
      ctx.logger.error("[alertmanager] Failed to ingest alerts", {
        error: error instanceof Error ? error.message : String(error),
        count: signals.length,
      });
    }),
  );

  return Response.json({ accepted: signals.length });
};

/** Constant-time check of the bearer token, as the scrape endpoint does. */
function isAuthorized(request: Request, expected: string): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;

  const [scheme, ...rest] = header.split(" ");
  if ("bearer" !== scheme?.toLowerCase()) return false;

  return safeSecretCompare(rest.join(" ").trim(), expected);
}
