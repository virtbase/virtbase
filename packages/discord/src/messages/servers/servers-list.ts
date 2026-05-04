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

import type { RouterOutputs } from "@virtbase/api";
import { APP_DOMAIN, formatBytes, truncate } from "@virtbase/utils";
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
import { getExtracted, getFormatter } from "next-intl/server";
import { MainMenuButton, ShowInPortalButton } from "../../buttons";
import { createEmbed } from "../../utils/create-embed";

export const ServersListMessage = async ({
  locale,
  type = InteractionResponseType.ChannelMessageWithSource,
  servers,
}: {
  locale: Locale;
  type?:
    | InteractionResponseType.ChannelMessageWithSource
    | InteractionResponseType.UpdateMessage;
  servers: RouterOutputs["servers"]["list"]["servers"];
}): Promise<
  | APIInteractionResponseChannelMessageWithSource
  | APIInteractionResponseUpdateMessage
> => {
  const t = await getExtracted({
    namespace: "discord-integration",
    locale,
  });
  const formatter = await getFormatter({
    locale,
  });

  return {
    type,
    data: {
      flags: MessageFlags.Ephemeral,
      embeds: [
        await createEmbed({
          locale,
          title: t("Manage servers"),
          description: [
            t(
              "The following servers are assigned to your account and can be managed.",
            ),
            "",
            t("Select a server to manage it:"),
          ].join("\n"),
          fields: servers.slice(0, 25).map((server) => ({
            name: truncate(server.name, 256) as string,
            value: [
              ...(typeof server.plan === "object"
                ? [
                    [
                      t(
                        "{cores, plural, =0 {# vCores} =1 {# vCore} other {# vCores}}",
                        {
                          cores: server.plan.cores,
                        },
                      ),
                      t("{memory} RAM", {
                        memory: formatBytes(server.plan.memory * 1024 * 1024, {
                          formatter,
                        }),
                      }),
                      t("{storage} NVMe SSD", {
                        storage: formatBytes(
                          server.plan.storage * 1024 * 1024 * 1024,
                          { formatter },
                        ),
                      }),
                    ].join(" • "),
                  ]
                : []),
              `[${t("View in portal ↗")}](${APP_DOMAIN}/servers/${server.id}/overview)`,
            ]
              .filter((value) => typeof value === "string")
              .join("\n"),
          })),
        }),
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: "string-select:servers-list",
              required: true,
              min_values: 1,
              max_values: 1,
              placeholder: truncate(t("Select a server"), 150) as string,
              options: servers.slice(0, 25).map((server) => ({
                label: truncate(server.name, 100) as string,
                value: server.id,
                description:
                  typeof server.plan === "object"
                    ? server.plan.name
                    : server.id,
              })),
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            await MainMenuButton({ locale }),
            await ShowInPortalButton({ locale, pathname: "/servers" }),
          ],
        },
      ],
    },
  };
};
