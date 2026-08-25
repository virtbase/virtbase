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

import type {
  APIActionRowComponent,
  APIComponentInMessageActionRow,
  APIEmbed,
  APIInteractionResponseChannelMessageWithSource,
  APIInteractionResponseUpdateMessage,
} from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";

/**
 * Whether a message replaces the one its component sits on, or starts a new
 * one. Every builder takes it, so any screen can be reached both from a
 * command and from a button without a second variant.
 */
export type ResponseType =
  | InteractionResponseType.ChannelMessageWithSource
  | InteractionResponseType.UpdateMessage;

export type MessageResponse =
  | APIInteractionResponseChannelMessageWithSource
  | APIInteractionResponseUpdateMessage;

/**
 * Wraps embeds and components into a response.
 *
 * Every message this bot sends is ephemeral: it answers about somebody's
 * servers, in channels they share with other people, and a console link or a
 * hostname is nobody else's business. Making that the default here rather than
 * a flag each builder remembers is what keeps it true.
 */
export const message = ({
  type = InteractionResponseType.ChannelMessageWithSource,
  embeds,
  components = [],
}: {
  type?: ResponseType;
  embeds: APIEmbed[];
  components?: APIActionRowComponent<APIComponentInMessageActionRow>[];
}): MessageResponse =>
  ({
    type,
    data: {
      flags: MessageFlags.Ephemeral,
      embeds,
      components: components.filter((component) => component.components.length),
    },
  }) as MessageResponse;
