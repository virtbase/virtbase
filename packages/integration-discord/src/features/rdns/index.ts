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

import type { ManagedPointerRecord } from "@virtbase/ports";
import { ServerManagementError } from "@virtbase/ports";
import { ButtonStyle, InteractionResponseType } from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted } from "next-intl/server";

import type { LinkedInteractionContext } from "../../handlers/types";
import { actionButton, row, select } from "../../ui/components";
import { ConfirmMessage } from "../../ui/confirm";
import { EMOJI } from "../../ui/emoji";
import type { MessageResponse } from "../../ui/message";
import { message } from "../../ui/message";
import { modal, modalValue } from "../../ui/modal";
import { actorFor } from "../../utils/actor";
import { createEmbed } from "../../utils/create-embed";
import { requireServerId } from "../servers";
import type { DiscordFeature } from "../types";

const PAGE_SIZE = 25;

const RdnsMessage = async ({
  locale,
  serverId,
  records,
}: {
  locale: Locale;
  serverId: string;
  records: ManagedPointerRecord[];
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  return message({
    type: InteractionResponseType.UpdateMessage,
    embeds: [
      await createEmbed({
        locale,
        title: t("Reverse DNS"),
        description:
          records.length === 0
            ? t(
                "No reverse DNS records are set. Mail servers in particular expect an address to resolve back to its hostname.",
              )
            : t(
                "These records say which hostname each of your addresses resolves back to.",
              ),
        fields: records.map((record) => ({
          name: record.ip,
          value: record.hostname,
        })),
      }),
    ],
    components: [
      row(
        records.length > 0 &&
          select({
            feature: "rdns",
            action: "pick",
            params: [serverId],
            placeholder: t("Select a record to edit or delete"),
            options: records.map((record) => ({
              label: record.ip,
              value: record.id,
              description: record.hostname,
            })),
          }),
      ),
      row(
        actionButton({
          feature: "rdns",
          action: "add",
          params: [serverId],
          label: t("Set a record"),
          emoji: EMOJI.add,
          style: ButtonStyle.Primary,
        }),
        actionButton({
          feature: "rdns",
          action: "menu",
          params: [serverId],
          label: t("Refresh"),
          emoji: EMOJI.refresh,
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

const RecordMessage = async ({
  locale,
  serverId,
  record,
}: {
  locale: Locale;
  serverId: string;
  record: ManagedPointerRecord;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  return message({
    type: InteractionResponseType.UpdateMessage,
    embeds: [
      await createEmbed({
        locale,
        title: record.ip,
        fields: [{ name: t("Hostname"), value: record.hostname }],
      }),
    ],
    components: [
      row(
        actionButton({
          feature: "rdns",
          action: "edit",
          params: [serverId, record.id],
          label: t("Change hostname"),
          emoji: EMOJI.edit,
          style: ButtonStyle.Primary,
        }),
        actionButton({
          feature: "rdns",
          action: "delete-confirm",
          params: [serverId, record.id],
          label: t("Delete"),
          emoji: EMOJI.delete,
          style: ButtonStyle.Danger,
        }),
      ),
      row(
        actionButton({
          feature: "rdns",
          action: "menu",
          params: [serverId],
          label: t("Back to records"),
          emoji: EMOJI.back,
        }),
      ),
    ],
  });
};

const listRecords = async (
  ctx: Pick<LinkedInteractionContext, "user" | "servers">,
  serverId: string,
): Promise<ManagedPointerRecord[]> => {
  const { records } = await ctx.servers.rdns.list(actorFor(ctx.user), {
    server_id: serverId,
    page: 1,
    per_page: PAGE_SIZE,
    expand: [],
    sort: ["id:asc"],
  });

  return records;
};

const renderList = async (
  ctx: Pick<LinkedInteractionContext, "locale" | "user" | "servers">,
  serverId: string,
): Promise<MessageResponse> =>
  RdnsMessage({
    locale: ctx.locale,
    serverId,
    records: await listRecords(ctx, serverId),
  });

const requireRecordId = (ctx: { params: string[] }): string => {
  const recordId = ctx.params[1];
  if (!recordId) {
    throw new Error(
      "[@virtbase/discord] Expected the component's custom id to carry a record id",
    );
  }
  return recordId;
};

/**
 * Reverse DNS for the server's addresses.
 *
 * The API upserts by address rather than by record id, so setting a record and
 * changing one are the same call — which is why "add" and "edit" both end in
 * the same modal, differing only in whether the address arrives prefilled.
 */
export const rdnsFeature: DiscordFeature = {
  id: "rdns",

  buttons: {
    menu: (ctx) =>
      ctx.deferred(() => renderList(ctx, requireServerId(ctx)), {
        update: true,
      }),

    add: async (ctx) => {
      const serverId = requireServerId(ctx);
      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      return modal({
        feature: "rdns",
        action: "save",
        params: [serverId],
        title: t("Set reverse DNS"),
        note: t(
          "The address has to be one of the addresses allocated to this server.",
        ),
        fields: [
          {
            id: "ip",
            label: t("IP address"),
            description: t("One of this server's addresses."),
            placeholder: "192.0.2.10",
            maxLength: 45,
          },
          {
            id: "hostname",
            label: t("Hostname"),
            description: t("What this address should resolve back to."),
            placeholder: "vm01.example.com",
            maxLength: 253,
          },
        ],
      });
    },

    // Editing is an upsert on the same address, so the modal is the same form
    // with the address filled in and the record's current hostname shown.
    edit: async (ctx) => {
      const serverId = requireServerId(ctx);
      const recordId = requireRecordId(ctx);
      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      const record = (await listRecords(ctx, serverId)).find(
        (candidate) => candidate.id === recordId,
      );

      if (!record) {
        throw new ServerManagementError(
          "not_found",
          `No reverse DNS record ${recordId}`,
        );
      }

      return modal({
        feature: "rdns",
        action: "save",
        params: [serverId],
        title: t("Change reverse DNS"),
        fields: [
          {
            id: "ip",
            label: t("IP address"),
            value: record.ip,
            maxLength: 45,
          },
          {
            id: "hostname",
            label: t("Hostname"),
            description: t("What this address should resolve back to."),
            value: record.hostname,
            maxLength: 253,
          },
        ],
      });
    },

    "delete-confirm": async (ctx) => {
      const serverId = requireServerId(ctx);
      const recordId = requireRecordId(ctx);
      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      return ConfirmMessage({
        locale: ctx.locale,
        title: t("Delete this reverse DNS record?"),
        description: t(
          "The address will stop resolving back to its hostname. Mail sent from it is likely to be rejected.",
        ),
        confirmLabel: t("Delete"),
        confirm: {
          feature: "rdns",
          action: "delete",
          params: [serverId, recordId],
        },
        cancel: { feature: "rdns", action: "menu", params: [serverId] },
      });
    },

    delete: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);

          await ctx.servers.rdns.delete(actorFor(ctx.user), {
            server_id: serverId,
            id: requireRecordId(ctx),
          });

          return renderList(ctx, serverId);
        },
        { update: true },
      ),
  },

  selects: {
    pick: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);
          const [recordId] = ctx.interaction.data.values;

          const record = (await listRecords(ctx, serverId)).find(
            (candidate) => candidate.id === recordId,
          );

          if (!record) {
            throw new ServerManagementError(
              "not_found",
              `No reverse DNS record ${recordId}`,
            );
          }

          return RecordMessage({ locale: ctx.locale, serverId, record });
        },
        { update: true },
      ),
  },

  modals: {
    save: (ctx) =>
      ctx.deferred(async () => {
        const serverId = requireServerId(ctx);
        const ip = modalValue(ctx.interaction.data.components, "ip")?.trim();
        const hostname = modalValue(
          ctx.interaction.data.components,
          "hostname",
        )?.trim();

        if (!ip || !hostname) {
          throw new ServerManagementError(
            "invalid_input",
            "Both the address and the hostname are required",
          );
        }

        await ctx.servers.rdns.upsert(actorFor(ctx.user), {
          server_id: serverId,
          ip,
          hostname,
        });

        return renderList(ctx, serverId);
      }),
  },
};
