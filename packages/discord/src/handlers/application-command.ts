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

import type { APIApplicationCommandInteraction } from "discord-api-types/v10";
import { ApplicationCommandType } from "discord-api-types/v10";
import { commands } from "../commands";
import { MainMenuMessage, SetupMenuMessage } from "../messages";
import { InviteMessage } from "../messages/invite";
import { getUserByInteraction } from "../utils/get-user-by-interaction";
import { mapDiscordLocale } from "../utils/map-discord-locale";
import type { InteractionHandler } from "./types";

export const handleApplicationCommand: InteractionHandler<
  APIApplicationCommandInteraction
> = async (interaction) => {
  // User has used any registered command

  const { name, type } = interaction.data;
  const locale = mapDiscordLocale(interaction.locale);

  if (type === ApplicationCommandType.ChatInput) {
    // The command was typed in the chat
    switch (name) {
      case commands.invite.name:
        return InviteMessage({ locale });
      case commands.menu.name: {
        const user = await getUserByInteraction(interaction);
        if (!user) {
          // The user invoked the menu command, but has not linked their account yet
          // We send them a setup guide on how to link their account
          return SetupMenuMessage({ locale });
        }

        // The user was found, so we send them the main menu
        // This is the hub for any following actions
        return MainMenuMessage({ locale });
      }
      default:
        // Pass through, handle at the end of the function
        break;
    }
  }

  // Unhandled command
  throw new Error(`[@virtbase/discord] Unhandled application command: ${name}`);
};
