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

import type { APIMessageComponentInteraction } from "discord-api-types/v10";
import { InteractionResponseType } from "discord-api-types/v10";
import { MainMenuMessage } from "../messages";
import { mapDiscordLocale } from "../utils/map-discord-locale";
import type { InteractionHandler } from "./types";

export const handleButtonComponent: InteractionHandler<
  APIMessageComponentInteraction
> = async (interaction) => {
  const { custom_id } = interaction.data;
  const locale = mapDiscordLocale(interaction.locale);

  switch (custom_id) {
    case "button:main-menu":
      // The user has clicked the back to main menu button
      // Edit the current message to reflect that
      return MainMenuMessage({
        locale,
        type: InteractionResponseType.UpdateMessage,
      });
    case "button:manage-servers-menu":
      break;
    default:
      // Pass through, handle at the end of the function
      break;
  }

  // Unhandled button component
  throw new Error(
    `[@virtbase/discord] Unhandled button component: ${custom_id}`,
  );
};
