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

import type { ManagedServer, ManagedServerStatus } from "@virtbase/ports";
import { formatBytes, ProxmoxServerStatus, truncate } from "@virtbase/utils";
import { ButtonStyle, InteractionResponseType } from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted, getFormatter } from "next-intl/server";

import { actionButton, row } from "../../ui/components";
import { ConfirmMessage } from "../../ui/confirm";
import { EMOJI } from "../../ui/emoji";
import { formatUptime, stateEmoji, usageBar } from "../../ui/format";
import type { MessageResponse, ResponseType } from "../../ui/message";
import { message } from "../../ui/message";
import { actorFor } from "../../utils/actor";
import { createEmbed } from "../../utils/create-embed";
import type { renderOverview } from "../servers";
import { requireServerId } from "../servers";
import type { DiscordFeature } from "../types";

/**
 * The power actions the port accepts.
 *
 * `stop` and `reset` cut the power rather than asking the guest to wind down,
 * so both go through a confirmation; `shutdown` and `reboot` ask politely and
 * do not.
 */
const ACTIONS = ["start", "shutdown", "reboot", "stop", "reset"] as const;

type PowerAction = (typeof ACTIONS)[number];

const isPowerAction = (value: string): value is PowerAction =>
  (ACTIONS as readonly string[]).includes(value);

const PowerMenuMessage = async ({
  locale,
  type = InteractionResponseType.UpdateMessage,
  server,
  status,
}: {
  locale: Locale;
  type?: ResponseType;
  server: ManagedServer;
  status: ManagedServerStatus | null;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });
  const formatter = await getFormatter({ locale });

  const running = status?.state === ProxmoxServerStatus.RUNNING;
  const stopped = status?.state === ProxmoxServerStatus.STOPPED;
  const stats = status?.stats;

  // A task in flight means Proxmox is mid-operation; offering another power
  // action would queue a second one against a machine already changing state.
  const busy = Boolean(status?.task);

  return message({
    type,
    embeds: [
      await createEmbed({
        locale,
        title: t("Power — {name}", {
          name: truncate(server.name, 200) as string,
        }),
        description: status
          ? [
              `${stateEmoji(status.state)} **${status.state}**${
                status.task ? ` · ${status.task}` : ""
              }`,
              "",
              stats &&
                [
                  t("CPU {bar}", { bar: usageBar(stats.cpu ?? 0, 1) }),
                  t("RAM {bar} ({used} of {total})", {
                    bar: usageBar(stats.mem ?? 0, stats.maxmem ?? 0),
                    used: formatBytes(stats.mem ?? 0, { formatter }),
                    total: formatBytes(stats.maxmem ?? 0, { formatter }),
                  }),
                  t("Uptime: {uptime}", { uptime: formatUptime(stats.uptime) }),
                ].join("\n"),
            ]
              .filter((line): line is string => typeof line === "string")
              .join("\n")
          : t("The current state could not be read from the node."),
      }),
    ],
    components: [
      row(
        actionButton({
          feature: "power",
          action: "run",
          params: [server.id, "start"],
          label: t("Start"),
          emoji: EMOJI.start,
          style: ButtonStyle.Success,
          disabled: busy || running,
        }),
        actionButton({
          feature: "power",
          action: "run",
          params: [server.id, "reboot"],
          label: t("Reboot"),
          emoji: EMOJI.reboot,
          disabled: busy || !running,
        }),
        actionButton({
          feature: "power",
          action: "run",
          params: [server.id, "shutdown"],
          label: t("Shut down"),
          emoji: EMOJI.shutdown,
          disabled: busy || !running,
        }),
      ),
      row(
        actionButton({
          feature: "power",
          action: "confirm",
          params: [server.id, "stop"],
          label: t("Force stop"),
          emoji: EMOJI.forceStop,
          style: ButtonStyle.Danger,
          disabled: busy || stopped,
        }),
        actionButton({
          feature: "power",
          action: "confirm",
          params: [server.id, "reset"],
          label: t("Hard reset"),
          emoji: EMOJI.reset,
          style: ButtonStyle.Danger,
          disabled: busy || stopped,
        }),
      ),
      row(
        actionButton({
          feature: "power",
          action: "menu",
          params: [server.id],
          label: t("Refresh"),
          emoji: EMOJI.refresh,
        }),
        actionButton({
          feature: "servers",
          action: "overview",
          params: [server.id],
          label: t("Back to server"),
          emoji: EMOJI.back,
        }),
      ),
    ],
  });
};

const renderPowerMenu = async (
  ctx: Parameters<typeof renderOverview>[0] & { serverId: string },
): Promise<MessageResponse> => {
  const actor = actorFor(ctx.user);

  const [{ server }, status] = await Promise.all([
    ctx.servers.get(actor, { server_id: ctx.serverId, expand: [] }),
    ctx.servers.status
      .get(actor, { server_id: ctx.serverId, with_storage_usage: false })
      .then((result) => result.status)
      .catch(() => null),
  ]);

  return PowerMenuMessage({ locale: ctx.locale, server, status });
};

const requireAction = (ctx: { params: string[] }): PowerAction => {
  const action = ctx.params[1];
  if (!action || !isPowerAction(action)) {
    throw new Error(
      `[@virtbase/discord] Unknown power action in custom id: ${action}`,
    );
  }
  return action;
};

/**
 * Starting, stopping and restarting a server, and the live figures that say
 * whether it worked.
 *
 * Proxmox accepts a power action and returns before it has finished, so the
 * screen this returns to shows the task rather than the settled state. That is
 * what the refresh button is for.
 */
export const powerFeature: DiscordFeature = {
  id: "power",

  buttons: {
    menu: (ctx) =>
      ctx.deferred(
        () => renderPowerMenu({ ...ctx, serverId: requireServerId(ctx) }),
        { update: true },
      ),

    confirm: async (ctx) => {
      const serverId = requireServerId(ctx);
      const action = requireAction(ctx);
      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      return ConfirmMessage({
        locale: ctx.locale,
        title:
          action === "stop"
            ? t("Force stop this server?")
            : t("Hard reset this server?"),
        description:
          action === "stop"
            ? t(
                "This cuts the power immediately, without letting the operating system shut down. Unsaved data may be lost.",
              )
            : t(
                "This is the equivalent of the reset button. The operating system is not asked to shut down and unsaved data may be lost.",
              ),
        confirmLabel: action === "stop" ? t("Force stop") : t("Hard reset"),
        confirm: {
          feature: "power",
          action: "run",
          params: [serverId, action],
        },
        cancel: { feature: "power", action: "menu", params: [serverId] },
      });
    },

    run: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);
          const action = requireAction(ctx);

          await ctx.servers.status.update(actorFor(ctx.user), {
            server_id: serverId,
            action,
          });

          return renderPowerMenu({ ...ctx, serverId });
        },
        { update: true },
      ),
  },
};
