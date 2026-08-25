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

import { APP_DOMAIN, PUBLIC_DOMAIN } from "@virtbase/utils";
import { InteractionResponseType } from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted } from "next-intl/server";

import { actionButton, linkButton, row } from "../../ui/components";
import { EMOJI } from "../../ui/emoji";
import type { MessageResponse, ResponseType } from "../../ui/message";
import { message } from "../../ui/message";
import { createEmbed } from "../../utils/create-embed";
import { buildInviteUrl } from "../../utils/invite-url";

/** Where the guide lives. One constant, linked from four different screens. */
export const helpArticleUrl = (locale: Locale) =>
  `${PUBLIC_DOMAIN}/${locale}/help/article/discord-integration`;

/**
 * The hub every other screen returns to.
 *
 * Only reachable with a linked account — {@link SetupMenuMessage} is what an
 * unlinked customer sees instead.
 */
export const MainMenuMessage = async ({
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
        title: t("Main menu"),
        description: t("Please select an action from the menu below."),
      }),
    ],
    components: [
      row(
        actionButton({
          feature: "servers",
          action: "list",
          label: t("Manage servers"),
          emoji: EMOJI.servers,
        }),
        actionButton({
          feature: "menu",
          action: "help",
          label: t("What can this bot do?"),
          emoji: EMOJI.idea,
        }),
      ),
      row(
        linkButton({
          url: `${APP_DOMAIN}/servers`,
          label: t("Show in portal"),
        }),
      ),
    ],
  });
};

/**
 * Shown whenever an unlinked customer reaches something that needs an account.
 *
 * The bot cannot identify anyone by their Discord id alone, so this is the only
 * possible answer — and it is a set of instructions rather than a refusal.
 */
export const SetupMenuMessage = async ({
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
      row(
        linkButton({
          url: `${APP_DOMAIN}/account/settings/authentication`,
          label: t("Link my account"),
        }),
        linkButton({
          url: helpArticleUrl(locale),
          label: t("Setup guide"),
          emoji: EMOJI.guide,
        }),
      ),
    ],
  });
};

/** The "add me to your server" screen, behind `/invite`. */
export const InviteMessage = async ({
  locale,
  appId,
  type = InteractionResponseType.ChannelMessageWithSource,
}: {
  locale: Locale;
  appId: string;
  type?: ResponseType;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });
  const url = buildInviteUrl(appId);

  return message({
    type,
    embeds: [
      await createEmbed({
        locale,
        title: t("Invite Virtbase to your server"),
        description: [
          t(
            "Click the button below to add the Virtbase integration to your Discord server:",
          ),
          "",
          url,
        ].join("\n"),
      }),
    ],
    components: [
      row(
        linkButton({ url, label: t("Add to server"), emoji: EMOJI.add }),
        linkButton({
          url: helpArticleUrl(locale),
          label: t("Setup guide"),
          emoji: EMOJI.guide,
        }),
      ),
    ],
  });
};

/**
 * What the bot can do, and where to read more.
 *
 * Reachable both from `/help` and from a button on the main menu, because the
 * people who most need it are the ones who will not think to type a command.
 */
export const HelpMessage = async ({
  locale,
  appId,
  type = InteractionResponseType.ChannelMessageWithSource,
}: {
  locale: Locale;
  appId: string;
  type?: ResponseType;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  return message({
    type,
    embeds: [
      await createEmbed({
        locale,
        title: t("Manage your servers from Discord"),
        description: t(
          "Link your Virtbase account once, then run **/menu** to manage every server you rent — without opening the portal.",
        ),
        fields: [
          {
            name: t("🖥️ Servers"),
            value: t(
              "See every server you rent, with its plan, operating system, node and IP addresses.",
            ),
          },
          {
            name: t("⚡ Power"),
            value: t(
              "Start, reboot, shut down or stop a server, and read its live CPU, memory, disk and network usage.",
            ),
          },
          {
            name: t("📈 Statistics"),
            value: t(
              "See CPU, memory and network usage over the last hour, day, week, month or year.",
            ),
          },
          {
            name: t("💾 Backups"),
            value: t("Create, restore and delete backups."),
          },
          {
            name: t("🛡️ Firewall & rDNS"),
            value: t(
              "Turn the firewall on or off, add and remove rules, and set reverse DNS for your addresses.",
            ),
          },
          {
            name: t("🔧 Settings"),
            value: t(
              "Rename a server, reinstall it with a different operating system, mount an installer image and review your plan.",
            ),
          },
          {
            name: t("🔑 Access"),
            value: t(
              "Open a one-time console link and reset the administrator password.",
            ),
          },
          {
            name: t("🏅 Linked roles"),
            value: t(
              "Link your account and Discord servers can grant you roles based on how long you have been a customer and how many servers you run.",
            ),
          },
        ],
      }),
    ],
    components: [
      row(
        linkButton({
          url: helpArticleUrl(locale),
          label: t("Read the guide"),
          emoji: EMOJI.guide,
        }),
        linkButton({
          url: buildInviteUrl(appId),
          label: t("Add to server"),
          emoji: EMOJI.add,
        }),
        linkButton({ url: APP_DOMAIN, label: t("Customer portal") }),
      ),
      row(
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
