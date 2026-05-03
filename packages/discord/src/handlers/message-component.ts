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
import { ComponentType } from "discord-api-types/v10";
import { handleButtonComponent } from "./button-component";
import type { InteractionHandler } from "./types";

export const handleMessageComponent: InteractionHandler<
  APIMessageComponentInteraction
> = async (interaction) => {
  // User has interacted with a message component

  const { custom_id, component_type } = interaction.data;

  if (component_type === ComponentType.Button) {
    return handleButtonComponent(interaction);
  }

  switch (custom_id) {
    default:
      // Pass through, handle at the end of the function
      break;
  }

  // Unhandled message component
  throw new Error(
    `[@virtbase/discord] Unhandled message component: ${custom_id}`,
  );
};
