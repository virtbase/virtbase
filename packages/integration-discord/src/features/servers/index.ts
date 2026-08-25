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
import { InteractionResponseType } from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted } from "next-intl/server";

import type { LinkedInteractionContext } from "../../handlers/types";
import type { MessageResponse } from "../../ui/message";
import { modal, modalValue } from "../../ui/modal";
import { actorFor } from "../../utils/actor";
import type { DiscordFeature } from "../types";
import {
  PAGE_SIZE,
  ResetPasswordSuccessMessage,
  ServerConsoleMessage,
  ServerOverviewMessage,
  ServersListEmptyMessage,
  ServersListMessage,
} from "./messages";

export * from "./messages";

/**
 * The server overview, rebuilt from scratch.
 *
 * Shared because five features end on it: every action returns the customer to
 * the screen they started from, with the effect of what they just did already
 * visible.
 */
export const renderOverview = async ({
  locale,
  user,
  servers,
  emojis,
  serverId,
  type = InteractionResponseType.UpdateMessage,
}: Pick<LinkedInteractionContext, "locale" | "user" | "servers" | "emojis"> & {
  serverId: string;
  type?: MessageResponse["type"];
}): Promise<MessageResponse> => {
  const actor = actorFor(user);

  const [{ server }, status] = await Promise.all([
    servers.get(actor, {
      server_id: serverId,
      expand: ["plan", "template", "datacenter", "node", "allocations"],
    }),
    // The record is readable even when its node is not, and a live figure is
    // worth less than the screen it would otherwise take down.
    servers.status
      .get(actor, { server_id: serverId, with_storage_usage: true })
      .then((result) => result.status)
      .catch(() => null),
  ]);

  return ServerOverviewMessage({ locale, type, server, status, emojis });
};

const renderList = async ({
  locale,
  user,
  servers,
  emojis,
  page,
  type = InteractionResponseType.UpdateMessage,
}: Pick<LinkedInteractionContext, "locale" | "user" | "servers" | "emojis"> & {
  page: number;
  type?: MessageResponse["type"];
}): Promise<MessageResponse> => {
  const { servers: owned, meta } = await servers.list(actorFor(user), {
    page,
    per_page: PAGE_SIZE,
    expand: ["plan", "template"],
  });

  if (owned.length === 0) return ServersListEmptyMessage({ locale, type });

  return ServersListMessage({
    locale,
    type,
    servers: owned,
    page: meta.pagination.page,
    totalPages: meta.pagination.last_page ?? 1,
    emojis,
  });
};

const PasswordModal = async ({
  locale,
  serverId,
}: {
  locale: Locale;
  serverId: string;
}) => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  return modal({
    feature: "servers",
    action: "password",
    params: [serverId],
    title: t("Reset Password"),
    note: t(
      "This action will fail if the package `qemu-guest-agent` is not installed.",
    ),
    fields: [
      {
        id: "username",
        label: t("Username"),
        description: t(
          "Mostly `root` for Linux and `Administrator` for Windows.",
        ),
        placeholder: "root",
        value: "root",
        minLength: 1,
        maxLength: 64,
      },
      {
        id: "password",
        label: t("New Password"),
        description: t(
          "One uppercase letter, one lowercase letter, one number, and 8 characters minimum.",
        ),
        placeholder: "********",
        minLength: 8,
        maxLength: 100,
      },
    ],
  });
};

/**
 * Listing servers, opening one, and the two actions that belong to the machine
 * itself rather than to any of its subsystems.
 */
export const serversFeature: DiscordFeature = {
  id: "servers",

  buttons: {
    list: (ctx) =>
      ctx.deferred(
        () =>
          renderList({
            ...ctx,
            page: Math.max(1, Number(ctx.params[0] ?? "1") || 1),
          }),
        { update: true },
      ),

    overview: (ctx) =>
      ctx.deferred(
        () => renderOverview({ ...ctx, serverId: requireServerId(ctx) }),
        { update: true },
      ),

    console: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);
          const url = await ctx.servers.console(actorFor(ctx.user), {
            server_id: serverId,
          });

          return ServerConsoleMessage({
            locale: ctx.locale,
            type: InteractionResponseType.UpdateMessage,
            url,
            serverId,
          });
        },
        { update: true },
      ),

    // A modal has to be the immediate answer to the interaction, so this one
    // cannot defer — which is fine, because opening a form touches nothing.
    password: (ctx) =>
      PasswordModal({ locale: ctx.locale, serverId: requireServerId(ctx) }),
  },

  selects: {
    pick: (ctx) => {
      const [serverId] = ctx.interaction.data.values;
      if (!serverId) {
        throw new ServerManagementError(
          "invalid_input",
          "No server was selected",
        );
      }

      return ctx.deferred(() => renderOverview({ ...ctx, serverId }), {
        update: true,
      });
    },
  },

  modals: {
    password: (ctx) =>
      ctx.deferred(async () => {
        const serverId = requireServerId(ctx);
        const username = modalValue(
          ctx.interaction.data.components,
          "username",
        );
        const password = modalValue(
          ctx.interaction.data.components,
          "password",
        );

        if (!username || !password) {
          throw new ServerManagementError(
            "invalid_input",
            "The username and password are both required",
          );
        }

        await ctx.servers.resetPassword(actorFor(ctx.user), {
          server_id: serverId,
          username,
          password,
        });

        return ResetPasswordSuccessMessage({ locale: ctx.locale, serverId });
      }),
  },
};

/**
 * The server id every per-server component carries.
 *
 * A component without one is a bug in whichever message built it, not
 * something a customer can cause, so this throws rather than degrading.
 */
export const requireServerId = (ctx: { params: string[] }): string => {
  const [serverId] = ctx.params;
  if (!serverId) {
    throw new Error(
      "[@virtbase/discord] Expected the component's custom id to carry a server id",
    );
  }
  return serverId;
};
