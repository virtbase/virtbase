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

import type { APIApplicationRoleConnectionMetadata } from "discord-api-types/v10";
import type { DiscordClient } from "./client";

export const getRoleConnectionMetadata = (client: DiscordClient) =>
  client.request<APIApplicationRoleConnectionMetadata[]>(
    "GET",
    `/applications/${client.appId}/role-connections/metadata`,
  );

/**
 * Bulk overwrite, same semantics as commands.
 *
 * @see https://discord.com/developers/docs/resources/application-role-connection-metadata#bulk-overwrite-application-role-connection-metadata
 */
export const putRoleConnectionMetadata = (
  client: DiscordClient,
  payload: APIApplicationRoleConnectionMetadata[],
) =>
  client.request<APIApplicationRoleConnectionMetadata[]>(
    "PUT",
    `/applications/${client.appId}/role-connections/metadata`,
    payload,
  );
