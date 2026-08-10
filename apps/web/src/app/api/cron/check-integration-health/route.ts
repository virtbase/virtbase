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

import { captureException } from "@sentry/nextjs";
import {
  integrationConfigStore,
  integrations,
} from "@virtbase/api/integrations";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Probes every enabled integration and stores the result.
 *
 * Without this, health is only ever as fresh as the last time somebody opened
 * the admin console and pressed "Check now" — which means the status badges
 * describe the past rather than the present.
 *
 * Configuration is re-read first: an integration whose credentials changed
 * since this process started would otherwise be probed with the old ones.
 */
const handler = withCronSecret(async () => {
  const store = integrationConfigStore;
  if (!store) {
    return new Response("CONFIG_ENCRYPTION_KEY is not configured", {
      status: 500,
    });
  }

  integrations.invalidate();

  const results = await integrations.health();
  const summary: Record<string, string> = {};

  for (const [integrationId, health] of Object.entries(results)) {
    summary[integrationId] = health.status;

    // Only installed integrations have a row to record against; the store
    // ignores the rest.
    try {
      await store.recordHealth(integrationId, {
        status: health.status,
        message: "message" in health ? health.message : null,
        checkedAt: health.checkedAt,
      });
    } catch (error) {
      // One integration failing to record must not stop the others.
      captureException(error, {
        tags: { "integration.health.record": integrationId },
      });
    }
  }

  const unhealthy = Object.entries(summary)
    .filter(([, status]) => status === "error")
    .map(([integrationId]) => integrationId);

  if (unhealthy.length > 0) {
    console.warn(`[CRON] Unhealthy integrations: ${unhealthy.join(", ")}`);
  }

  return Response.json({ checked: summary }, { status: 200 });
});

export { handler as GET };
