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
import type { APIModalSubmitInteraction } from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import { ResetServerPasswordSuccessMessage } from "../../messages/servers/actions/reset-server-password-success";
import { mapDiscordLocale } from "../../utils/map-discord-locale";
import type { InteractionHandler } from "../types";

export const handleResetServerPasswordModalSubmit: InteractionHandler<
  APIModalSubmitInteraction
> = async ({ interaction, caller }) => {
  const { custom_id } = interaction.data;

  const serverId = custom_id.split(":")[2];
  if (!serverId) {
    throw new Error(
      `[@virtbase/discord] Expected modal 'reset-server-password' to have a server ID.`,
    );
  }

  const [usernameComponent, passwordComponent] =
    interaction.data.components.slice(1);
  if (!usernameComponent || !passwordComponent) {
    throw new Error(
      `[@virtbase/discord] Expected modal 'reset-server-password' to have a username and password input.`,
    );
  }

  if (
    usernameComponent.type !== ComponentType.Label ||
    passwordComponent.type !== ComponentType.Label
  ) {
    throw new Error(
      `[@virtbase/discord] Expected modal 'reset-server-password' to have a username and password input as type 'Label', got: ${usernameComponent.type} and ${passwordComponent.type}.`,
    );
  }

  const usernameInput = usernameComponent.component;
  const passwordInput = passwordComponent.component;

  if (
    usernameInput.type !== ComponentType.TextInput ||
    passwordInput.type !== ComponentType.TextInput
  ) {
    throw new Error(
      `[@virtbase/discord] Expected modal 'reset-server-password' to have a username and password input as type 'TextInput', got: ${usernameInput.type} and ${passwordInput.type}.`,
    );
  }

  const username = usernameInput.value;
  const password = passwordInput.value;

  const locale = mapDiscordLocale(interaction.locale);

  try {
    await caller.servers.actions.resetPassword({
      server_id: serverId,
      username,
      password,
    });

    return ResetServerPasswordSuccessMessage({
      locale,
      serverId,
    });
  } catch (error) {
    if (error instanceof TRPCError) {
      // TODO: Error handling
      throw error;
    }

    throw error;
  }
};
