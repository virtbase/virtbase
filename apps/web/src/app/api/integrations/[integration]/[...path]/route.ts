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

import Sentry from "@sentry/nextjs";
import { integrations } from "@virtbase/api/integrations";

type RouteContext = {
  params: Promise<{ integration: string; path: string[] }>;
};

/**
 * Mounts every integration's declared webhooks at
 * `/api/integrations/<integration>/<path>`.
 *
 * The request is passed through untouched: signature schemes verify against the
 * exact bytes, so reading the body here would break every one of them.
 * Verification is the integration's job, not this route's.
 */
async function dispatch(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { integration: integrationId, path } = await context.params;

  const resolved = await integrations.resolveWebhook(
    integrationId,
    path.join("/"),
    request.method,
  );

  // Unknown, disabled, misconfigured and no-such-path all answer identically,
  // so this endpoint cannot be used to enumerate installed integrations.
  if (!resolved) {
    return new Response("Not found.", { status: 404 });
  }

  try {
    return await resolved.webhook.handler(request, resolved.context);
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        "integration.webhook.error": "true",
        "integration.id": integrationId,
        "integration.webhook.path": path.join("/"),
      },
    });

    return new Response("Failed to handle request.", { status: 500 });
  }
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
