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

import type { APIApplicationCommand } from "discord-api-types/v10";
import { ApplicationCommandType } from "discord-api-types/v10";

type Command = Omit<
  APIApplicationCommand,
  "id" | "application_id" | "default_member_permissions" | "version"
>;

export const commands = {
  invite: {
    name: "invite",
    description: "Invite the Virtbase bot to your server",
    description_localizations: {},
    type: ApplicationCommandType.ChatInput,
  },
  menu: {
    name: "menu",
    description: "Show the main menu with all available actions",
    description_localizations: {},
    type: ApplicationCommandType.ChatInput,
  },
} satisfies Record<string, Command>;
