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

import type { RESTPatchAPIInteractionOriginalResponseJSONBody } from "discord-api-types/v10";

import type { DiscordClient } from "./client";

/**
 * Replaces the placeholder sent by a deferred response.
 *
 * The interaction token, not the bot token, authorizes this — which is why the
 * path carries it and the client's `Authorization` header is simply ignored by
 * Discord here. Tokens are valid for 15 minutes.
 *
 * @see https://discord.com/developers/docs/interactions/receiving-and-responding#edit-original-interaction-response
 */
export const editOriginalResponse = (
  client: DiscordClient,
  token: string,
  body: RESTPatchAPIInteractionOriginalResponseJSONBody,
) =>
  client.request<unknown>(
    "PATCH",
    `/webhooks/${client.appId}/${token}/messages/@original`,
    body,
  );

/** An additional message on the same interaction, after the original. */
export const createFollowUp = (
  client: DiscordClient,
  token: string,
  body: RESTPatchAPIInteractionOriginalResponseJSONBody,
) =>
  client.request<unknown>("POST", `/webhooks/${client.appId}/${token}`, body);
