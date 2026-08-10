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

import { POST as dispatchIntegrationWebhook } from "../../integrations/[integration]/[...path]/route";

/**
 * TODO: DELETE THIS ROUTE once the Discord developer portal's "Interactions
 * Endpoint URL" has been repointed and verified in production.
 *
 * Legacy mount point for the Discord interactions endpoint. The handler itself
 * now lives in `@virtbase/integration-discord` and is served at
 * `/api/integrations/discord/interactions`; this file only forwards to it.
 *
 * To retire it:
 *   1. Set the Interactions Endpoint URL to
 *      `https://<host>/api/integrations/discord/interactions`
 *   2. Confirm Discord's verification ping succeeds and a slash command works
 *   3. Delete this directory
 */
export async function POST(request: Request) {
  return dispatchIntegrationWebhook(request, {
    params: Promise.resolve({
      integration: "discord",
      path: ["interactions"],
    }),
  });
}
