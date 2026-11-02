/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { PUBLIC_DOMAIN } from "@virtbase/utils";

/** Where an agent finds the public API and what describes it. */
export const API_DISCOVERY = {
  api: `${PUBLIC_DOMAIN}/api/v1`,
  catalog: `${PUBLIC_DOMAIN}/.well-known/api-catalog`,
  openapi: `${PUBLIC_DOMAIN}/api/openapi.json`,
  docs: `${PUBLIC_DOMAIN}/api/docs`,
} as const;

/**
 * The `Link` header on the home page that points agents at the API catalog,
 * the API's descriptions and `llms.txt` (RFC 9727, RFC 8631, llmstxt.org).
 */
export const HOME_DISCOVERY_LINKS = [
  `<${API_DISCOVERY.catalog}>; rel="api-catalog"`,
  `<${API_DISCOVERY.openapi}>; rel="service-desc"; type="application/vnd.oai.openapi+json"`,
  `<${API_DISCOVERY.docs}>; rel="service-doc"; type="text/html"`,
  `<${PUBLIC_DOMAIN}/llms.txt>; rel="describedby"; type="text/plain"`,
].join(", ");
