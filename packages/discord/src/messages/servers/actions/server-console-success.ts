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
  APIInteractionResponseChannelMessageWithSource,
  APIInteractionResponseUpdateMessage,
} from "discord-api-types/v10";
import {
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted } from "next-intl/server";
import { ServerOverviewButton } from "../../../buttons/server-overview";
import { createEmbed } from "../../../utils/create-embed";

export const ServerConsoleSuccessMessage = async ({
  locale,
  type = InteractionResponseType.ChannelMessageWithSource,
  url,
  serverId,
}: {
  locale: Locale;
  type?:
    | InteractionResponseType.ChannelMessageWithSource
    | InteractionResponseType.UpdateMessage;
  url: string;
  serverId: string;
}): Promise<
  | APIInteractionResponseChannelMessageWithSource
  | APIInteractionResponseUpdateMessage
> => {
  const t = await getExtracted({
    namespace: "discord-integration",
    locale,
  });

  return {
    type,
    data: {
      flags: MessageFlags.Ephemeral,
      embeds: [
        await createEmbed({
          locale,
          title: t("Console"),
          description: [
            t("Click the one-time link below to access the console:"),
            t("This link will expire in 10 seconds."),
            "",
            url,
          ].join("\n"),
        }),
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [await ServerOverviewButton({ locale, serverId })],
        },
      ],
    },
  };
};
