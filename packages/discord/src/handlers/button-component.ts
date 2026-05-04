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

import type { APIMessageComponentButtonInteraction } from "discord-api-types/v10";
import { InteractionResponseType } from "discord-api-types/v10";
import { MainMenuMessage, SetupMenuMessage } from "../messages";
import { ServersListMessage } from "../messages/servers/servers-list";
import { ServersListEmptyMessage } from "../messages/servers/servers-list-empty";
import { ResetServerPasswordModal } from "../modals";
import { mapDiscordLocale } from "../utils/map-discord-locale";
import { handleServerConsoleButton } from "./buttons/server-console";
import { handleServerOverviewButton } from "./buttons/server-overview";
import type { InteractionHandler } from "./types";

export const handleButtonComponent: InteractionHandler<
  APIMessageComponentButtonInteraction
> = async ({ interaction, user, caller }) => {
  const { custom_id } = interaction.data;
  const locale = mapDiscordLocale(interaction.locale);

  if (!user) {
    // The user invoked the button component, but has not linked their account yet
    return SetupMenuMessage({
      locale,
      type: InteractionResponseType.UpdateMessage,
    });
  }

  const [type, action, ...args] = custom_id.split(":");
  if (type !== "button") {
    throw new Error(
      `[@virtbase/discord] Expected button custom_id to start with 'button:', got: ${custom_id}`,
    );
  }

  if (!action) {
    throw new Error(
      `[@virtbase/discord] Expected button custom_id to have an action, got: ${custom_id}`,
    );
  }

  switch (action) {
    case "main-menu":
      // The user has clicked the back to main menu button
      // Edit the current message to reflect that
      return MainMenuMessage({
        locale,
        type: InteractionResponseType.UpdateMessage,
      });
    case "manage-servers-menu": {
      // TODO: error handling + pagination
      const { servers } = await caller.servers.list({
        page: 1,
        per_page: 25,
        expand: ["plan"],
      });

      if (!servers.length) {
        return ServersListEmptyMessage({
          locale,
          type: InteractionResponseType.UpdateMessage,
        });
      }

      return ServersListMessage({
        locale,
        type: InteractionResponseType.UpdateMessage,
        servers,
      });
    }
    case "reset-server-password": {
      const [serverId] = args;
      if (!serverId) {
        throw new Error(
          `[@virtbase/discord] Expected button 'reset-server-password' to have a server ID.`,
        );
      }

      return ResetServerPasswordModal({
        locale,
        serverId,
      });
    }
    case "server-console": {
      return handleServerConsoleButton({
        interaction,
        user,
        caller,
      });
    }
    case "server-overview": {
      return handleServerOverviewButton({
        interaction,
        user,
        caller,
      });
    }
    default:
      // Pass through, handle at the end of the function
      break;
  }

  // Unhandled button component
  throw new Error(
    `[@virtbase/discord] Unhandled button component: ${custom_id}`,
  );
};
