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
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
} from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted } from "next-intl/server";
import { DISCORD_INTEGRATION_INVITE_URL } from "../utils/consts";
import { createEmbed } from "../utils/create-embed";

export const InviteMessage = async ({
  locale,
  url = DISCORD_INTEGRATION_INVITE_URL,
  type = InteractionResponseType.ChannelMessageWithSource,
}: {
  locale: Locale;
  url?: string;
  type?:
    | InteractionResponseType.ChannelMessageWithSource
    | InteractionResponseType.UpdateMessage;
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
      embeds: [
        await createEmbed({
          locale,
          title: t("Invite Virtbase to your server"),
          description: [
            t(
              "Click the link below to add the Virtbase integration to your Discord server:",
            ),
            "",
            url,
          ].join("\n"),
        }),
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Link,
              label: t("Invite URL"),
              url,
            },
          ],
        },
      ],
    },
  };
};
