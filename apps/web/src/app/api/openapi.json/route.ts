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

import { getOpenApiDocument } from "../docs/openapi-document.ts";

/**
 * The public API's OpenAPI document, for tools and agents. The reference at
 * `/api/docs` renders the same document.
 */
export async function GET() {
  return Response.json(await getOpenApiDocument(), {
    headers: { "Content-Type": "application/vnd.oai.openapi+json" },
  });
}
