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

import type { APIApplicationCommand } from "discord-api-types/v10";
import type { DiscordClient } from "./client";

export const listCommands = (client: DiscordClient) =>
  client.request<APIApplicationCommand[]>(
    "GET",
    `/applications/${client.appId}/commands`,
  );

/**
 * Bulk overwrite. Discord treats the payload as the complete desired set, so a
 * command dropped from `commands.ts` disappears without a separate delete.
 *
 * @see https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
 */
export const putCommands = (client: DiscordClient, payload: unknown[]) =>
  client.request<APIApplicationCommand[]>(
    "PUT",
    `/applications/${client.appId}/commands`,
    payload,
  );
