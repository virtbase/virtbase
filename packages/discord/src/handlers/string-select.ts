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
import type { APIMessageComponentSelectMenuInteraction } from "discord-api-types/v10";
import { InteractionResponseType } from "discord-api-types/v10";
import { MainMenuMessage, SetupMenuMessage } from "../messages";
import { ServerOverviewMessage } from "../messages/servers/server-overview";
import { mapDiscordLocale } from "../utils/map-discord-locale";
import type { InteractionHandler } from "./types";

export const handleStringSelectComponent: InteractionHandler<
  APIMessageComponentSelectMenuInteraction
> = async ({ interaction, user, caller }) => {
  const { custom_id } = interaction.data;
  const locale = mapDiscordLocale(interaction.locale);

  if (!user) {
    return SetupMenuMessage({ locale });
  }

  const [type, action, ..._args] = custom_id.split(":");
  if (type !== "string-select") {
    throw new Error(
      `[@virtbase/discord] Expected string-select custom_id to start with 'string-select:', got: ${custom_id}`,
    );
  }

  if (!action) {
    throw new Error(
      `[@virtbase/discord] Expected string-select custom_id to have an action, got: ${custom_id}`,
    );
  }

  switch (action) {
    case "servers-list": {
      const [serverId] = interaction.data.values;
      if (!serverId) {
        throw new Error(
          `[@virtbase/discord] Expected 'string-select:servers-list' component to have a server ID.`,
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
          // TODO: Error handling, server might not exist anymore.
          return MainMenuMessage({
            locale,
            type: InteractionResponseType.UpdateMessage,
          });
        }
        throw error;
      }
    }
  }

  throw new Error(
    `[@virtbase/discord] Unhandled string-select component: ${custom_id}, action: ${action}`,
  );
};
