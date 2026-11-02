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
import { API_DISCOVERY } from "@/lib/api-discovery.ts";

/**
 * The API catalog (RFC 9727): where the public API lives, its OpenAPI
 * description and its documentation, as a linkset.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9727
 */
export function GET() {
  const linkset = {
    linkset: [
      {
        anchor: API_DISCOVERY.api,
        "service-desc": [
          {
            href: API_DISCOVERY.openapi,
            type: "application/vnd.oai.openapi+json",
          },
        ],
        "service-doc": [{ href: API_DISCOVERY.docs, type: "text/html" }],
      },
    ],
  };

  return Response.json(linkset, {
    headers: {
      "Content-Type": `application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"`,
      Link: `<${PUBLIC_DOMAIN}/.well-known/api-catalog>; rel="api-catalog"`,
    },
  });
}
