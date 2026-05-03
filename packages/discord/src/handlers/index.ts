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

import type { APIInteraction } from "discord-api-types/v10";
import { InteractionType } from "discord-api-types/v10";
import { handleApplicationCommand } from "./application-command";
import { handleMessageComponent } from "./message-component";
import { handleModalSubmit } from "./modal-submit";
import { handlePing } from "./ping";
import type { InteractionHandler } from "./types";

const handlersMapping = {
  [InteractionType.Ping]: handlePing,
  [InteractionType.ApplicationCommand]: handleApplicationCommand,
  [InteractionType.MessageComponent]: handleMessageComponent,
  [InteractionType.ModalSubmit]: handleModalSubmit,
} as Partial<Record<InteractionType, InteractionHandler<APIInteraction>>>;

export const getInteractionHandler = (
  type: InteractionType,
): InteractionHandler<APIInteraction> => {
  const handler = handlersMapping[type];
  if (!handler) {
    throw new Error(`[@virtbase/discord] Unhandled interaction type: ${type}`);
  }
  return handler;
};
