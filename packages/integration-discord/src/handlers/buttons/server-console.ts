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

import { ServerManagementError } from "@virtbase/ports";
import type { APIMessageComponentButtonInteraction } from "discord-api-types/v10";
import { InteractionResponseType } from "discord-api-types/v10";
import { SetupMenuMessage } from "../../messages";
import { ServerConsoleSuccessMessage } from "../../messages/servers/actions/server-console-success";
import { actorFor } from "../../utils/actor";
import { mapDiscordLocale } from "../../utils/map-discord-locale";
import type { InteractionHandler } from "../types";

export const handleServerConsoleButton: InteractionHandler<
  APIMessageComponentButtonInteraction
> = async ({ interaction, user, servers }) => {
  const locale = mapDiscordLocale(interaction.locale);
  if (!user) {
    return SetupMenuMessage({
      locale,
      type: InteractionResponseType.UpdateMessage,
    });
  }

  const { custom_id } = interaction.data;
  const serverId = custom_id.split(":")[2];

  if (!serverId) {
    throw new Error(
      `[@virtbase/discord] Expected button 'server-console' to have a server ID.`,
    );
  }

  try {
    const url = await servers.console(actorFor(user), {
      server_id: serverId,
    });

    return ServerConsoleSuccessMessage({
      locale,
      type: InteractionResponseType.UpdateMessage,
      url,
      serverId,
    });
  } catch (error) {
    if (error instanceof ServerManagementError) {
      // TODO: Error handling
      throw error;
    }

    throw error;
  }
};
