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

import type { APIEmoji } from "discord-api-types/v10";

import type { DiscordClient } from "./client";

/**
 * Application emojis are usable in every server the app is in, without the app
 * being a member of one. Unlike guild emojis they carry no `roles`,
 * `require_colons`, `managed` or `available` fields.
 *
 * The list endpoint answers with an `{ items: [...] }` wrapper rather than a
 * bare array — the one place where these endpoints diverge from the guild ones.
 *
 * @see https://docs.discord.com/developers/resources/emoji
 */
export const listEmojis = async (
  client: DiscordClient,
): Promise<APIEmoji[]> => {
  const response = await client.request<{ items?: APIEmoji[] } | APIEmoji[]>(
    "GET",
    `/applications/${client.appId}/emojis`,
  );

  // Tolerate both shapes: the wrapper is what the API documents, but reading a
  // bare array costs nothing and saves a debugging session if it ever changes.
  if (Array.isArray(response)) return response;
  return response.items ?? [];
};

/** `image` is a data URI. Max 256 KiB, PNG/JPEG/GIF/WebP/AVIF. */
export const createEmoji = (
  client: DiscordClient,
  input: { name: string; image: string },
) =>
  client.request<APIEmoji>(
    "POST",
    `/applications/${client.appId}/emojis`,
    input,
  );

export const patchEmoji = (
  client: DiscordClient,
  emojiId: string,
  input: { name: string },
) =>
  client.request<APIEmoji>(
    "PATCH",
    `/applications/${client.appId}/emojis/${emojiId}`,
    input,
  );

export const deleteEmoji = (client: DiscordClient, emojiId: string) =>
  client.request<void>(
    "DELETE",
    `/applications/${client.appId}/emojis/${emojiId}`,
  );
