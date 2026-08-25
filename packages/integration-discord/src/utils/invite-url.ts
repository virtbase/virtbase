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

import { PermissionFlagsBits } from "discord-api-types/v10";

/**
 * What the bot asks for when it is added to a server.
 *
 * Only what it actually uses: it posts replies and it answers slash commands.
 * Every reply it sends is ephemeral, and it reads no message content — asking
 * for more would be a permission dialog nobody should accept.
 */
export const INVITE_PERMISSIONS =
  PermissionFlagsBits.SendMessages | PermissionFlagsBits.UseApplicationCommands;

/**
 * The "add to server" URL for a given application.
 *
 * Takes the app id as an argument rather than reading `DISCORD_APP_ID`: the id
 * is integration configuration and lives in `integration_installations`, so
 * every caller gets it from the context the registry built.
 */
export const buildInviteUrl = (appId: string): string => {
  const params = new URLSearchParams({
    client_id: appId,
    permissions: INVITE_PERMISSIONS.toString(),
    scope: "bot applications.commands",
  });

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
};
