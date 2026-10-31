/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type {
  APIApplicationCommandInteraction,
  APIInteraction,
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
  APIMessageComponentInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIModalSubmitInteraction,
} from "discord-api-types/v10";
import { ComponentType, InteractionType } from "discord-api-types/v10";

import {
  buttonHandlers,
  commandHandlers,
  modalHandlers,
  selectHandlers,
} from "../features/index.ts";
import { SetupMenuMessage } from "../features/menu/index.ts";
import { runComponent } from "./dispatch.ts";
import type { InteractionContext, InteractionHandler } from "./types.ts";

export * from "./defer.ts";
export * from "./dispatch.ts";
export * from "./types.ts";

const handleApplicationCommand: InteractionHandler = async (ctx) => {
  const { name } = (ctx.interaction as APIApplicationCommandInteraction).data;
  const entry = commandHandlers.get(name);

  if (!entry) {
    throw new Error(
      `[@virtbase/discord] Unhandled application command: ${name}`,
    );
  }

  if (!entry.allowUnlinked && !ctx.user) {
    return SetupMenuMessage({ locale: ctx.locale });
  }

  return entry.handle(
    ctx as InteractionContext<APIApplicationCommandInteraction>,
  );
};

const handleMessageComponent: InteractionHandler = async (ctx) => {
  const interaction = ctx.interaction as APIMessageComponentInteraction;
  const { custom_id, component_type } = interaction.data;

  if (component_type === ComponentType.Button) {
    return runComponent<APIMessageComponentButtonInteraction>(
      ctx,
      "button",
      custom_id,
      buttonHandlers,
    );
  }

  if (component_type === ComponentType.StringSelect) {
    return runComponent<APIMessageComponentSelectMenuInteraction>(
      ctx,
      "select",
      custom_id,
      selectHandlers,
    );
  }

  throw new Error(
    `[@virtbase/discord] Unhandled message component: ${custom_id}, type: ${component_type}`,
  );
};

const handleModalSubmit: InteractionHandler = (ctx) =>
  runComponent<APIModalSubmitInteraction>(
    ctx,
    "modal",
    (ctx.interaction as APIModalSubmitInteraction).data.custom_id,
    modalHandlers,
  );

/**
 * Which of the three tables an interaction is routed through.
 *
 * `Ping` is absent on purpose: the webhook answers it before a context is ever
 * built, so that Discord's endpoint verification does not depend on the
 * database or on a capability being resolvable.
 */
const handlers: Partial<Record<InteractionType, InteractionHandler>> = {
  [InteractionType.ApplicationCommand]: handleApplicationCommand,
  [InteractionType.MessageComponent]: handleMessageComponent,
  [InteractionType.ModalSubmit]: handleModalSubmit,
};

export const getInteractionHandler = (
  type: InteractionType,
): InteractionHandler => {
  const handler = handlers[type];
  if (!handler) {
    throw new Error(`[@virtbase/discord] Unhandled interaction type: ${type}`);
  }
  return handler;
};

export type { APIInteraction, APIInteractionResponse };
