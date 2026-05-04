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
import { APP_DOMAIN, formatBits, truncate } from "@virtbase/utils";
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
import {
  ManageServersButton,
  RenewServerButton,
  ResetServerPasswordButton,
  ShowInPortalButton,
} from "../../buttons";
import { ServerConsoleButton } from "../../buttons/server-console";
import { createEmbed } from "../../utils/create-embed";

export const ServerOverviewMessage = async ({
  locale,
  type = InteractionResponseType.ChannelMessageWithSource,
  server,
}: {
  locale: Locale;
  type?:
    | InteractionResponseType.ChannelMessageWithSource
    | InteractionResponseType.UpdateMessage;
  server: RouterOutputs["servers"]["get"]["server"];
}): Promise<
  | APIInteractionResponseChannelMessageWithSource
  | APIInteractionResponseUpdateMessage
> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });
  const formatter = await getFormatter({ locale });

  return {
    type,
    data: {
      flags: MessageFlags.Ephemeral,
      embeds: [
        await createEmbed({
          locale,
          author: {
            name: truncate(server.name, 256) as string,
            url: `${APP_DOMAIN}/servers/${server.id}/overview`,
          },
          fields: [
            {
              name: "ID",
              value: server.id,
            },
            ...(typeof server.template === "object" && server.template !== null
              ? [
                  {
                    name: t("Operating System"),
                    value: server.template.name,
                  },
                ]
              : []),
            ...(typeof server.node === "object"
              ? [
                  {
                    name: t("Node"),
                    value: [
                      t("- Name: {hostname}", {
                        hostname: server.node.hostname,
                      }),
                      typeof server.datacenter === "object"
                        ? t("- Datacenter: {datacenter}", {
                            datacenter: server.datacenter.name,
                          })
                        : "",
                      server.node.netrate
                        ? t("- Uplink: {netrate}", {
                            netrate: formatBits(server.node.netrate * 1e6 * 8, {
                              formatter,
                              perSecond: true,
                              base: 1000,
                            }),
                          })
                        : "",
                      server.node.cpu_description
                        ? t("- CPU: {cpu_description}", {
                            cpu_description: server.node.cpu_description,
                          })
                        : "",
                      server.node.memory_description
                        ? t("- RAM: {memory_description}", {
                            memory_description: server.node.memory_description,
                          })
                        : "",
                      server.node.storage_description
                        ? t("- Storage: {storage_description}", {
                            storage_description:
                              server.node.storage_description,
                          })
                        : "",
                    ]
                      .filter(Boolean)
                      .join("\n"),
                  },
                ]
              : []),
            ...(typeof server.allocations === "object" &&
            server.allocations.length > 0
              ? [
                  {
                    name: t("Network Interfaces"),
                    value: server.allocations
                      .map((allocation) => {
                        if (typeof allocation === "string") {
                          return `- ${allocation}`;
                        }
                        return `- ${allocation.subnet.cidr} (Gateway: ${allocation.subnet.gateway})`;
                      })
                      .join("\n"),
                  },
                ]
              : []),
          ],
        }),
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            await ServerConsoleButton({ locale, serverId: server.id }),
            await ResetServerPasswordButton({ locale, serverId: server.id }),
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            await ManageServersButton({ locale }),
            await ShowInPortalButton({
              locale,
              pathname: `/servers/${server.id}/overview`,
            }),
            await RenewServerButton({ locale, serverId: server.id }),
          ],
        },
      ],
    },
  };
};
