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

import type { ManagedGraphPoint } from "@virtbase/ports";
import { ServerManagementError } from "@virtbase/ports";
import { APP_DOMAIN, formatBytes, truncate } from "@virtbase/utils";
import type { APIMessageComponentSelectMenuInteraction } from "discord-api-types/v10";
import { InteractionResponseType } from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted, getFormatter } from "next-intl/server";

import type { LinkedInteractionContext } from "../../handlers/types";
import { sparkline, summarize } from "../../ui/chart";
import { actionButton, linkButton, row, select } from "../../ui/components";
import { EMOJI } from "../../ui/emoji";
import type { MessageResponse } from "../../ui/message";
import { message } from "../../ui/message";
import { actorFor } from "../../utils/actor";
import { createEmbed } from "../../utils/create-embed";
import { requireServerId } from "../servers";
import type { DiscordFeature } from "../types";

/** The timeframes Proxmox's RRD keeps, in the order a customer thinks of them. */
const TIMEFRAMES = ["hour", "day", "week", "month", "year"] as const;

type Timeframe = (typeof TIMEFRAMES)[number];

const DEFAULT_TIMEFRAME: Timeframe = "day";

const isTimeframe = (value: string): value is Timeframe =>
  (TIMEFRAMES as readonly string[]).includes(value);

/** Discord wraps a code block past roughly this width on a phone. */
const CHART_WIDTH = 34;

const StatsMessage = async ({
  locale,
  serverId,
  serverName,
  timeframe,
  points,
}: {
  locale: Locale;
  serverId: string;
  serverName: string;
  timeframe: Timeframe;
  points: ManagedGraphPoint[];
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });
  const formatter = await getFormatter({ locale });

  const label: Record<Timeframe, string> = {
    hour: t("Last hour"),
    day: t("Last day"),
    week: t("Last week"),
    month: t("Last month"),
    year: t("Last year"),
  };

  const bytes = (value: number) => formatBytes(value, { formatter });
  const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

  const cpu = points.map((point) => point.cpu);
  // Proxmox reports the ceiling per sample; the last one is the current
  // allocation, and scaling every point to it is what makes the shape mean
  // "share of this server's memory" rather than "share of its own maximum".
  const maxmem = points.at(-1)?.maxmem ?? 0;
  const mem = points.map((point) => point.mem);
  const netin = points.map((point) => point.netin);
  const netout = points.map((point) => point.netout);

  const cpuStats = summarize(cpu);
  const memStats = summarize(mem);

  const chart = (values: number[], max?: number) =>
    `\`\`\`\n${sparkline(values, { width: CHART_WIDTH, max })}\n\`\`\``;

  return message({
    type: InteractionResponseType.UpdateMessage,
    embeds: [
      await createEmbed({
        locale,
        title: t("Statistics — {name}", {
          name: truncate(serverName, 180) as string,
        }),
        description:
          points.length === 0
            ? t(
                "No data for this period yet. A server reports usage only while it is running.",
              )
            : t("{timeframe}, oldest on the left.", {
                timeframe: label[timeframe],
              }),
        fields:
          points.length === 0
            ? []
            : [
                {
                  name: t("CPU — now {now}, average {avg}, peak {peak}", {
                    now: percent(cpuStats.last),
                    avg: percent(cpuStats.avg),
                    peak: percent(cpuStats.max),
                  }),
                  value: chart(cpu, 1),
                },
                {
                  name: t("Memory — now {now}, average {avg}, peak {peak}", {
                    now: bytes(memStats.last),
                    avg: bytes(memStats.avg),
                    peak: bytes(memStats.max),
                  }),
                  value: chart(mem, maxmem || undefined),
                },
                {
                  name: t("Network in — peak {peak}", {
                    peak: bytes(summarize(netin).max),
                  }),
                  value: chart(netin),
                },
                {
                  name: t("Network out — peak {peak}", {
                    peak: bytes(summarize(netout).max),
                  }),
                  value: chart(netout),
                },
              ],
      }),
    ],
    components: [
      row(
        select({
          feature: "stats",
          action: "timeframe",
          params: [serverId],
          placeholder: t("Timeframe"),
          options: TIMEFRAMES.map((value) => ({
            label: `${value === timeframe ? "● " : ""}${label[value]}`,
            value,
          })),
        }),
      ),
      row(
        actionButton({
          feature: "stats",
          action: "show",
          params: [serverId, timeframe],
          label: t("Refresh"),
          emoji: EMOJI.refresh,
        }),
        linkButton({
          url: `${APP_DOMAIN}/servers/${serverId}/overview`,
          label: t("Show in portal"),
          emoji: EMOJI.external,
        }),
      ),
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

const renderStats = async (
  ctx: Pick<LinkedInteractionContext, "locale" | "user" | "servers">,
  serverId: string,
  timeframe: Timeframe,
): Promise<MessageResponse> => {
  const actor = actorFor(ctx.user);

  const [{ server }, { data }] = await Promise.all([
    ctx.servers.get(actor, { server_id: serverId, expand: [] }),
    ctx.servers.graphs.get(actor, {
      server_id: serverId,
      timeframe,
      cf: "AVERAGE",
    }),
  ]);

  return StatsMessage({
    locale: ctx.locale,
    serverId,
    serverName: server.name,
    timeframe,
    points: data,
  });
};

const requestedTimeframe = (value: string | undefined): Timeframe =>
  value && isTimeframe(value) ? value : DEFAULT_TIMEFRAME;

/**
 * Resource usage over time, drawn as sparklines.
 *
 * Deliberately not an image: rendering a chart needs a library, a rasteriser
 * and an upload, and none of that fits in an interaction's three seconds. Block
 * characters in a code block answer the question a graph is actually opened
 * for — is it climbing, and is it near the ceiling.
 */
export const statsFeature: DiscordFeature = {
  id: "stats",

  buttons: {
    show: (ctx) =>
      ctx.deferred(
        () =>
          renderStats(
            ctx,
            requireServerId(ctx),
            requestedTimeframe(ctx.params[1]),
          ),
        { update: true },
      ),
  },

  selects: {
    timeframe: (
      ctx: LinkedInteractionContext<APIMessageComponentSelectMenuInteraction>,
    ) =>
      ctx.deferred(
        async () => {
          const [chosen] = ctx.interaction.data.values;
          if (!chosen || !isTimeframe(chosen)) {
            throw new ServerManagementError(
              "invalid_input",
              `"${chosen}" is not a timeframe`,
            );
          }

          return renderStats(ctx, requireServerId(ctx), chosen);
        },
        { update: true },
      ),
  },
};
