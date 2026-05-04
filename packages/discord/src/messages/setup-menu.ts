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
import { ShowInPortalButton } from "../buttons";
import { createEmbed } from "../utils/create-embed";

export const SetupMenuMessage = async ({
  locale,
  type = InteractionResponseType.ChannelMessageWithSource,
}: {
  locale: Locale;
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
      flags: MessageFlags.Ephemeral,
      embeds: [
        await createEmbed({
          locale,
          title: t("Setup"),
          description: [
            t("Welcome to Virtbase!"),
            "",
            t(
              "Your Virtbase account is currently not linked to your Discord account.",
            ),
            "",
            t("Please follow the instructions below to link your accounts:"),
          ].join("\n"),
          fields: [
            {
              name: t("1. Open customer portal"),
              value: t(
                "Click the button below and sign in with your Virtbase account.",
              ),
            },
            {
              name: t("2. Link accounts"),
              value: t(
                "Navigate to your account in the customer portal, under **Security** in the **Authentication** section. Link your Discord account here.",
              ),
            },
            {
              name: t("3. Repeat command"),
              value: t("Repeat the command to perform actions."),
            },
          ],
        }),
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            await ShowInPortalButton({
              locale,
              pathname: "/account/settings/authentication",
            }),
          ],
        },
      ],
    },
  };
};
