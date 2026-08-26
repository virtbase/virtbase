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
  ManagedServer,
  ManagedServerListItem,
  ManagedServerStatus,
} from "@virtbase/ports";
import {
  APP_DOMAIN,
  formatBits,
  formatBytes,
  PUBLIC_DOMAIN,
  truncate,
} from "@virtbase/utils";
import { ButtonStyle, InteractionResponseType } from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted, getFormatter } from "next-intl/server";

import type { EmojiResolver } from "../../emoji";
import {
  actionButton,
  linkButton,
  row,
  SELECT_OPTIONS_MAX,
  select,
} from "../../ui/components";
import { EMOJI } from "../../ui/emoji";
import {
  escapeMarkdown,
  formatUptime,
  stateEmoji,
  timestamp,
  usageBar,
} from "../../ui/format";
import type { MessageResponse, ResponseType } from "../../ui/message";
import { message } from "../../ui/message";
import { createEmbed } from "../../utils/create-embed";

/** Servers per page. Discord renders at most 25 select options. */
export const PAGE_SIZE = SELECT_OPTIONS_MAX;

export const ServersListMessage = async ({
  locale,
  type = InteractionResponseType.ChannelMessageWithSource,
  servers,
  page,
  totalPages,
  emojis,
}: {
  locale: Locale;
  type?: ResponseType;
  servers: ManagedServerListItem[];
  page: number;
  totalPages: number;
  emojis: EmojiResolver;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });
  const formatter = await getFormatter({ locale });

  return message({
    type,
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
        ...(totalPages > 1
          ? {
              footer: {
                text: t("Page {page} of {totalPages}", {
                  page: String(page),
                  totalPages: String(totalPages),
                }),
              },
            }
          : {}),
        fields: servers.map((server) => ({
          name: `${emojis.forOperatingSystem(
            server.operating_system,
          )} ${truncate(server.name, 200)}`.trim(),
          value: [
            typeof server.plan === "object" &&
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
            `[${t("View in portal ↗")}](${APP_DOMAIN}/servers/${server.id}/overview)`,
          ]
            .filter((value): value is string => typeof value === "string")
            .join("\n"),
        })),
      }),
    ],
    components: [
      row(
        select({
          feature: "servers",
          action: "pick",
          placeholder: t("Select a server"),
          options: servers.map((server) => ({
            label: server.name,
            value: server.id,
            description:
              typeof server.plan === "object" ? server.plan.name : server.id,
          })),
        }),
      ),
      row(
        totalPages > 1 &&
          actionButton({
            feature: "servers",
            action: "list",
            params: [String(page - 1)],
            label: t("Previous"),
            emoji: EMOJI.back,
            disabled: page <= 1,
          }),
        totalPages > 1 &&
          actionButton({
            feature: "servers",
            action: "list",
            params: [String(page + 1)],
            label: t("Next"),
            emoji: EMOJI.next,
            disabled: page >= totalPages,
          }),
      ),
      row(
        actionButton({
          feature: "menu",
          action: "home",
          label: t("Back to menu"),
          emoji: EMOJI.back,
        }),
        linkButton({
          url: `${APP_DOMAIN}/servers`,
          label: t("Show in portal"),
        }),
      ),
    ],
  });
};

export const ServersListEmptyMessage = async ({
  locale,
  type = InteractionResponseType.ChannelMessageWithSource,
}: {
  locale: Locale;
  type?: ResponseType;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  return message({
    type,
    embeds: [
      await createEmbed({
        locale,
        title: t("No servers available"),
        description: t(
          "You have not rented any servers yet. Rent a server to manage it via the Discord integration.",
        ),
      }),
    ],
    components: [
      row(
        linkButton({ url: PUBLIC_DOMAIN, label: t("Virtbase Store") }),
        actionButton({
          feature: "menu",
          action: "home",
          label: t("Back to menu"),
          emoji: EMOJI.back,
        }),
      ),
    ],
  });
};

/**
 * A server's home screen: what it is, what it is doing, and every action that
 * can be taken on it.
 *
 * `status` is optional because it comes from the hypervisor and that call can
 * fail while the server record itself is perfectly readable — a node being
 * unreachable should cost the live figures, not the whole screen.
 */
export const ServerOverviewMessage = async ({
  locale,
  type = InteractionResponseType.ChannelMessageWithSource,
  server,
  status,
  emojis,
}: {
  locale: Locale;
  type?: ResponseType;
  server: ManagedServer;
  status: ManagedServerStatus | null;
  emojis: EmojiResolver;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });
  const formatter = await getFormatter({ locale });

  // A partial server - a fixture, or a future field that has not shipped -
  // must cost the logo, never the screen.
  const operatingSystem = server.operating_system ?? null;
  const stats = status?.stats;

  return message({
    type,
    embeds: [
      await createEmbed({
        locale,
        author: {
          name: truncate(server.name, 256) as string,
          url: `${APP_DOMAIN}/servers/${server.id}/overview`,
        },
        ...(status
          ? {
              description: `${stateEmoji(status.state)} **${status.state}**${
                status.task ? ` · ${status.task}` : ""
              }`,
            }
          : {}),
        fields: [
          ...(status && stats
            ? [
                {
                  name: t("Usage"),
                  value: [
                    t("CPU {bar}", {
                      bar: usageBar(stats.cpu ?? 0, 1),
                    }),
                    t("RAM {bar} ({used} of {total})", {
                      bar: usageBar(stats.mem ?? 0, stats.maxmem ?? 0),
                      used: formatBytes(stats.mem ?? 0, { formatter }),
                      total: formatBytes(stats.maxmem ?? 0, { formatter }),
                    }),
                    t("Disk {bar} ({used} of {total})", {
                      bar: usageBar(stats.disk ?? 0, stats.maxdisk ?? 0),
                      used: formatBytes(stats.disk ?? 0, { formatter }),
                      total: formatBytes(stats.maxdisk ?? 0, { formatter }),
                    }),
                    t("Uptime: {uptime}", {
                      uptime: formatUptime(stats.uptime),
                    }),
                    t("Traffic: {in} in / {out} out", {
                      in: formatBytes(stats.netin ?? 0, { formatter }),
                      out: formatBytes(stats.netout ?? 0, { formatter }),
                    }),
                  ].join("\n"),
                },
              ]
            : []),
          { name: "ID", value: server.id },
          ...(operatingSystem?.name
            ? [
                {
                  name: t("Operating System"),
                  value: `${emojis.forOperatingSystem(operatingSystem)} ${
                    // [!] Guest-controlled when detected: this is the guest's
                    // own PRETTY_NAME, and an embed field renders markdown.
                    escapeMarkdown(
                      truncate(operatingSystem.name, 200) as string,
                    )
                  }`.trim(),
                },
              ]
            : []),
          ...(typeof server.node === "object"
            ? [
                {
                  name: t("Node"),
                  value: [
                    t("- Name: {hostname}", { hostname: server.node.hostname }),
                    typeof server.datacenter === "object" &&
                      t("- Datacenter: {datacenter}", {
                        datacenter: server.datacenter.name,
                      }),
                    server.node.netrate &&
                      t("- Uplink: {netrate}", {
                        netrate: formatBits(server.node.netrate * 1e6 * 8, {
                          formatter,
                          perSecond: true,
                          base: 1000,
                        }),
                      }),
                    server.node.cpu_description &&
                      t("- CPU: {cpu_description}", {
                        cpu_description: server.node.cpu_description,
                      }),
                  ]
                    .filter(
                      (value): value is string => typeof value === "string",
                    )
                    .join("\n"),
                },
              ]
            : []),
          ...(Array.isArray(server.allocations) && server.allocations.length > 0
            ? [
                {
                  name: t("Network Interfaces"),
                  value: server.allocations
                    .map((allocation) =>
                      typeof allocation === "string"
                        ? `- ${allocation}`
                        : `- ${allocation.subnet.cidr} (Gateway: ${allocation.subnet.gateway})`,
                    )
                    .join("\n"),
                },
              ]
            : []),
          ...(status?.terminates_at
            ? [
                {
                  name: t("Renews"),
                  value: timestamp(status.terminates_at, "R"),
                },
              ]
            : []),
        ],
      }),
    ],
    components: [
      row(
        actionButton({
          feature: "power",
          action: "menu",
          params: [server.id],
          label: t("Power"),
          emoji: EMOJI.power,
          style: ButtonStyle.Primary,
        }),
        actionButton({
          feature: "backups",
          action: "list",
          params: [server.id],
          label: t("Backups"),
          emoji: EMOJI.backups,
        }),
        actionButton({
          feature: "firewall",
          action: "menu",
          params: [server.id],
          label: t("Firewall"),
          emoji: EMOJI.firewall,
        }),
        actionButton({
          feature: "rdns",
          action: "menu",
          params: [server.id],
          label: t("rDNS"),
          emoji: EMOJI.rdns,
        }),
        actionButton({
          feature: "lifecycle",
          action: "menu",
          params: [server.id],
          label: t("Settings"),
          emoji: EMOJI.settings,
        }),
      ),
      row(
        actionButton({
          feature: "servers",
          action: "console",
          params: [server.id],
          label: t("Console"),
          emoji: EMOJI.servers,
        }),
        actionButton({
          feature: "servers",
          action: "password",
          params: [server.id],
          label: t("Reset password"),
          emoji: EMOJI.key,
        }),
        actionButton({
          feature: "stats",
          action: "show",
          params: [server.id],
          label: t("Statistics"),
          emoji: EMOJI.stats,
        }),
        actionButton({
          feature: "servers",
          action: "overview",
          params: [server.id],
          label: t("Refresh"),
          emoji: EMOJI.refresh,
        }),
      ),
      row(
        actionButton({
          feature: "servers",
          action: "list",
          label: t("All servers"),
          emoji: EMOJI.back,
        }),
        linkButton({
          url: `${APP_DOMAIN}/servers/${server.id}/overview`,
          label: t("Show in portal"),
        }),
      ),
    ],
  });
};

export const ServerConsoleMessage = async ({
  locale,
  type = InteractionResponseType.ChannelMessageWithSource,
  url,
  serverId,
}: {
  locale: Locale;
  type?: ResponseType;
  url: string;
  serverId: string;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  return message({
    type,
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
      row(
        linkButton({ url, label: t("Open console"), emoji: EMOJI.servers }),
        actionButton({
          feature: "servers",
          action: "overview",
          params: [serverId],
          label: t("Back to server"),
          emoji: EMOJI.back,
        }),
      ),
    ],
  });
};

export const ResetPasswordSuccessMessage = async ({
  locale,
  type = InteractionResponseType.ChannelMessageWithSource,
  serverId,
}: {
  locale: Locale;
  type?: ResponseType;
  serverId: string;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  return message({
    type,
    embeds: [
      await createEmbed({
        locale,
        title: t("Password reset successfully."),
        description: [
          t("The password for your server has been reset successfully."),
          t("You can now login to the server using the new password."),
        ].join(" "),
      }),
    ],
    components: [
      row(
        actionButton({
          feature: "servers",
          action: "overview",
          params: [serverId],
          label: t("Back to server"),
          emoji: EMOJI.back,
        }),
      ),
    ],
  });
};
