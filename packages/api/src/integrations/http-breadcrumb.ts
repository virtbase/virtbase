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

import type { Breadcrumb } from "@sentry/node";
import type { HttpRequestEvent } from "@virtbase/integration-sdk";

/**
 * The Sentry breadcrumb for one outbound request of an integration (ADR 0003).
 * The URL arrives redacted from `ctx.http`; a request without a response, or
 * with a 5xx, is a warning.
 */
export const toHttpBreadcrumb = ({
  integrationId,
  method,
  url,
  status,
  attempt,
  durationMs,
}: HttpRequestEvent): Breadcrumb => ({
  category: "integration.http",
  type: "http",
  level: status === null || status >= 500 ? "warning" : "info",
  data: {
    integration: integrationId,
    method,
    url,
    status_code: status,
    attempt,
    duration_ms: durationMs,
  },
});
