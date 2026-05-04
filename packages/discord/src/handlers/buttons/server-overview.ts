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

import { TRPCError } from "@virtbase/api";
import type { APIMessageComponentButtonInteraction } from "discord-api-types/v10";
import { InteractionResponseType } from "discord-api-types/v10";
import { SetupMenuMessage } from "../../messages";
import { ServerOverviewMessage } from "../../messages/servers/server-overview";
import { mapDiscordLocale } from "../../utils/map-discord-locale";
import type { InteractionHandler } from "../types";

export const handleServerOverviewButton: InteractionHandler<
  APIMessageComponentButtonInteraction
> = async ({ interaction, user, caller }) => {
  const locale = mapDiscordLocale(interaction.locale);
  if (!user) {
    return SetupMenuMessage({ locale });
  }

  const { custom_id } = interaction.data;
  const serverId = custom_id.split(":")[2];

  if (!serverId) {
    throw new Error(
      `[@virtbase/discord] Expected button 'server-overview' to have a server ID.`,
    );
  }

  try {
    const { server } = await caller.servers.get({
      server_id: serverId,
      expand: ["plan", "template", "datacenter", "node", "allocations"],
    });

    return ServerOverviewMessage({
      locale,
      type: InteractionResponseType.UpdateMessage,
      server,
    });
  } catch (error) {
    if (error instanceof TRPCError) {
      // TODO: Error handling
      throw error;
    }
    throw error;
  }
};
