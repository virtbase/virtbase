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

import { ServerManagementError } from "@virtbase/ports";
import type {
  APIInteractionResponseChannelMessageWithSource,
  APIInteractionResponseUpdateMessage,
} from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted } from "next-intl/server";

import { createEmbed } from "../utils/create-embed";

/**
 * What went wrong, in terms the customer can act on.
 *
 * A {@link ServerManagementError} carries a code the port defined precisely so
 * that a consumer can say "that server is gone" rather than "something broke",
 * without knowing tRPC exists. Anything else is genuinely unexpected and gets
 * the generic text — leaking an internal message into a Discord channel would
 * be worse than saying little.
 */
export const ErrorMessage = async ({
  locale,
  error,
  type = InteractionResponseType.ChannelMessageWithSource,
}: {
  locale: Locale;
  error: unknown;
  type?:
    | InteractionResponseType.ChannelMessageWithSource
    | InteractionResponseType.UpdateMessage;
}): Promise<
  | APIInteractionResponseChannelMessageWithSource
  | APIInteractionResponseUpdateMessage
> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  const describe = (): string => {
    if (!(error instanceof ServerManagementError)) {
      return t("Something went wrong. Please try again in a moment.");
    }

    switch (error.code) {
      case "not_found":
        return t("That server no longer exists.");
      case "forbidden":
      case "unauthorized":
        return t("You are not allowed to do that.");
      case "invalid_input":
        return t("Some of the details you entered are not valid.");
      case "rate_limited":
        return t("You are doing that too often. Please wait a moment.");
      case "conflict":
        return t(
          "The server is busy with another task. Please wait for it to finish.",
        );
      default:
        return t("Something went wrong. Please try again in a moment.");
    }
  };

  return {
    type,
    data: {
      flags: MessageFlags.Ephemeral,
      embeds: [
        await createEmbed({
          locale,
          title: t("That did not work"),
          description: describe(),
          color: 0xef4444,
        }),
      ],
    },
  };
};
