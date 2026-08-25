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

import type { ManagedServerBackup } from "@virtbase/ports";
import { ServerManagementError } from "@virtbase/ports";
import { formatBytes, truncate } from "@virtbase/utils";
import { ButtonStyle, InteractionResponseType } from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted, getFormatter } from "next-intl/server";

import type { EmojiResolver } from "../../emoji";
import type { LinkedInteractionContext } from "../../handlers/types";
import { actionButton, row, select } from "../../ui/components";
import { ConfirmMessage } from "../../ui/confirm";
import { EMOJI } from "../../ui/emoji";
import { timestamp } from "../../ui/format";
import type { MessageResponse, ResponseType } from "../../ui/message";
import { message } from "../../ui/message";
import { modal, modalValue } from "../../ui/modal";
import { actorFor } from "../../utils/actor";
import { createEmbed } from "../../utils/create-embed";
import { requireServerId } from "../servers";
import type { DiscordFeature } from "../types";

const PAGE_SIZE = 10;

/**
 * A backup row is written when the `vzdump` task starts and only settles once
 * the task finishes, so "running" is the absence of both terminal timestamps
 * rather than a state of its own.
 *
 * An unsettled row blocks every further backup of its server, which is why it
 * has to be shown as in-progress rather than hidden or reported as broken.
 */
const backupState = (backup: ManagedServerBackup) => {
  if (backup.failed_at) return "failed" as const;
  if (!backup.finished_at) return "running" as const;
  return "done" as const;
};

const STATE_EMOJI = { done: "✅", running: "⏳", failed: "❌" } as const;

const BackupsListMessage = async ({
  locale,
  type = InteractionResponseType.UpdateMessage,
  serverId,
  backups,
  page,
  totalPages,
  emojis,
}: {
  locale: Locale;
  type?: ResponseType;
  serverId: string;
  backups: ManagedServerBackup[];
  page: number;
  totalPages: number;
  emojis: EmojiResolver;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });
  const formatter = await getFormatter({ locale });

  // One running backup is enough to block the next: the API refuses to start a
  // second while a row is unsettled, so the button is disabled rather than
  // offered and then rejected.
  const busy = backups.some((backup) => backupState(backup) === "running");

  const restorable = backups.filter((backup) => backupState(backup) === "done");

  return message({
    type,
    embeds: [
      await createEmbed({
        locale,
        title: t("Backups"),
        description:
          backups.length === 0
            ? t(
                "This server has no backups yet. Create one to be able to roll back to this point later.",
              )
            : t(
                "A backup captures the whole server. Restoring one replaces everything on the disk.",
              ),
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
        fields: backups.map((backup) => {
          const state = backupState(backup);

          return {
            name: `${STATE_EMOJI[state]} ${backup.is_locked ? "🔒 " : ""}${truncate(backup.name, 200)}`,
            value: [
              state === "running" && t("In progress…"),
              state === "failed" &&
                t("Failed {when}", { when: timestamp(backup.failed_at, "R") }),
              state === "done" &&
                t("Created {when}", {
                  when: timestamp(backup.finished_at, "R"),
                }),
              state === "done" &&
                backup.size &&
                t("Size: {size}", {
                  size: formatBytes(backup.size, { formatter }),
                }),
              typeof backup.template === "object" &&
                backup.template !== null &&
                `${emojis.forTemplate(backup.template)} ${backup.template.name}`.trim(),
            ]
              .filter((line): line is string => typeof line === "string")
              .join("\n"),
          };
        }),
      }),
    ],
    components: [
      row(
        restorable.length > 0 &&
          select({
            feature: "backups",
            action: "pick",
            params: [serverId],
            placeholder: t("Select a backup"),
            options: restorable.map((backup) => ({
              label: backup.name,
              value: backup.id,
              description: backup.size
                ? formatBytes(backup.size, { formatter })
                : undefined,
            })),
          }),
      ),
      row(
        actionButton({
          feature: "backups",
          action: "create",
          params: [serverId],
          label: t("Create backup"),
          emoji: EMOJI.add,
          style: ButtonStyle.Primary,
          disabled: busy,
        }),
        actionButton({
          feature: "backups",
          action: "list",
          params: [serverId, String(page)],
          label: t("Refresh"),
          emoji: EMOJI.refresh,
        }),
      ),
      row(
        totalPages > 1 &&
          actionButton({
            feature: "backups",
            action: "list",
            params: [serverId, String(page - 1)],
            label: t("Previous"),
            emoji: EMOJI.back,
            disabled: page <= 1,
          }),
        totalPages > 1 &&
          actionButton({
            feature: "backups",
            action: "list",
            params: [serverId, String(page + 1)],
            label: t("Next"),
            emoji: EMOJI.next,
            disabled: page >= totalPages,
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

const BackupDetailMessage = async ({
  locale,
  serverId,
  backup,
}: {
  locale: Locale;
  serverId: string;
  backup: ManagedServerBackup;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });
  const formatter = await getFormatter({ locale });

  return message({
    type: InteractionResponseType.UpdateMessage,
    embeds: [
      await createEmbed({
        locale,
        title: truncate(backup.name, 200) as string,
        fields: [
          { name: t("Created"), value: timestamp(backup.finished_at) },
          ...(backup.size
            ? [
                {
                  name: t("Size"),
                  value: formatBytes(backup.size, { formatter }),
                },
              ]
            : []),
          {
            name: t("Locked"),
            value: backup.is_locked ? t("Yes") : t("No"),
          },
        ],
      }),
    ],
    components: [
      row(
        actionButton({
          feature: "backups",
          action: "restore-confirm",
          params: [serverId, backup.id],
          label: t("Restore"),
          emoji: EMOJI.restore,
          style: ButtonStyle.Primary,
        }),
        actionButton({
          feature: "backups",
          action: "lock",
          params: [serverId, backup.id],
          label: backup.is_locked ? t("Unlock") : t("Lock"),
          emoji: backup.is_locked ? "🔓" : "🔒",
        }),
        // A locked backup cannot be deleted; offering the button would be
        // offering a rejection.
        actionButton({
          feature: "backups",
          action: "delete-confirm",
          params: [serverId, backup.id],
          label: t("Delete"),
          emoji: EMOJI.delete,
          style: ButtonStyle.Danger,
          disabled: backup.is_locked,
        }),
      ),
      row(
        actionButton({
          feature: "backups",
          action: "list",
          params: [serverId],
          label: t("Back to backups"),
          emoji: EMOJI.back,
        }),
      ),
    ],
  });
};

const renderList = async (
  ctx: Pick<LinkedInteractionContext, "locale" | "user" | "servers" | "emojis">,
  serverId: string,
  page: number,
): Promise<MessageResponse> => {
  const { backups, meta } = await ctx.servers.backups.list(actorFor(ctx.user), {
    server_id: serverId,
    page,
    per_page: PAGE_SIZE,
    expand: ["template"],
    sort: ["id:desc"],
  });

  return BackupsListMessage({
    locale: ctx.locale,
    serverId,
    backups,
    page: meta.pagination.page,
    totalPages: meta.pagination.last_page ?? 1,
    emojis: ctx.emojis,
  });
};

const requireBackupId = (ctx: { params: string[] }): string => {
  const backupId = ctx.params[1];
  if (!backupId) {
    throw new Error(
      "[@virtbase/discord] Expected the component's custom id to carry a backup id",
    );
  }
  return backupId;
};

/**
 * Creating, restoring and deleting backups.
 *
 * `create` and `restore` both start a Proxmox task and return before it has
 * run, so every screen here is written against a state that may still be
 * changing — which is why the list shows a running backup rather than pretending
 * the operation was instant.
 */
export const backupsFeature: DiscordFeature = {
  id: "backups",

  buttons: {
    list: (ctx) =>
      ctx.deferred(
        () =>
          renderList(
            ctx,
            requireServerId(ctx),
            Math.max(1, Number(ctx.params[1] ?? "1") || 1),
          ),
        { update: true },
      ),

    create: async (ctx) => {
      const serverId = requireServerId(ctx);
      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      return modal({
        feature: "backups",
        action: "create",
        params: [serverId],
        title: t("Create backup"),
        note: t(
          "The server keeps running while the backup is taken. It may take several minutes.",
        ),
        fields: [
          {
            id: "name",
            label: t("Name"),
            description: t("How you will recognise this backup later."),
            placeholder: t("Before upgrade"),
            minLength: 1,
            maxLength: 64,
          },
        ],
      });
    },

    "restore-confirm": async (ctx) => {
      const serverId = requireServerId(ctx);
      const backupId = requireBackupId(ctx);
      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      return ConfirmMessage({
        locale: ctx.locale,
        title: t("Restore this backup?"),
        description: t(
          "Everything currently on the server's disk will be replaced by the contents of this backup. The server is stopped while it is restored, and anything created since the backup was taken is lost.",
        ),
        confirmLabel: t("Restore"),
        confirm: {
          feature: "backups",
          action: "restore",
          params: [serverId, backupId],
        },
        cancel: {
          feature: "backups",
          action: "pick-again",
          params: [serverId, backupId],
        },
      });
    },

    "delete-confirm": async (ctx) => {
      const serverId = requireServerId(ctx);
      const backupId = requireBackupId(ctx);
      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      return ConfirmMessage({
        locale: ctx.locale,
        title: t("Delete this backup?"),
        description: t(
          "The backup is removed from the storage and cannot be recovered.",
        ),
        confirmLabel: t("Delete"),
        confirm: {
          feature: "backups",
          action: "delete",
          params: [serverId, backupId],
        },
        cancel: {
          feature: "backups",
          action: "pick-again",
          params: [serverId, backupId],
        },
      });
    },

    restore: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);

          await ctx.servers.backups.restore(actorFor(ctx.user), {
            server_id: serverId,
            backup_id: requireBackupId(ctx),
          });

          return renderList(ctx, serverId, 1);
        },
        { update: true },
      ),

    delete: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);

          await ctx.servers.backups.delete(actorFor(ctx.user), {
            server_id: serverId,
            backup_id: requireBackupId(ctx),
          });

          return renderList(ctx, serverId, 1);
        },
        { update: true },
      ),

    lock: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);
          const backupId = requireBackupId(ctx);
          const actor = actorFor(ctx.user);

          const { backup } = await ctx.servers.backups.get(actor, {
            server_id: serverId,
            backup_id: backupId,
            expand: [],
          });

          const { backup: updated } = await ctx.servers.backups.update(actor, {
            server_id: serverId,
            backup_id: backupId,
            is_locked: !backup.is_locked,
          });

          return BackupDetailMessage({
            locale: ctx.locale,
            serverId,
            backup: updated,
          });
        },
        { update: true },
      ),

    /** Cancel on a confirmation returns to the backup it was opened from. */
    "pick-again": (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);
          const { backup } = await ctx.servers.backups.get(actorFor(ctx.user), {
            server_id: serverId,
            backup_id: requireBackupId(ctx),
            expand: [],
          });

          return BackupDetailMessage({ locale: ctx.locale, serverId, backup });
        },
        { update: true },
      ),
  },

  selects: {
    pick: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);
          const [backupId] = ctx.interaction.data.values;

          if (!backupId) {
            throw new ServerManagementError(
              "invalid_input",
              "No backup was selected",
            );
          }

          const { backup } = await ctx.servers.backups.get(actorFor(ctx.user), {
            server_id: serverId,
            backup_id: backupId,
            expand: [],
          });

          return BackupDetailMessage({ locale: ctx.locale, serverId, backup });
        },
        { update: true },
      ),
  },

  modals: {
    create: (ctx) =>
      ctx.deferred(async () => {
        const serverId = requireServerId(ctx);
        const name = modalValue(ctx.interaction.data.components, "name");

        if (!name) {
          throw new ServerManagementError(
            "invalid_input",
            "The backup needs a name",
          );
        }

        await ctx.servers.backups.create(actorFor(ctx.user), {
          server_id: serverId,
          name,
          // The only mode that leaves the server running, which is what a
          // customer taking a backup from a chat window expects.
          mode: "snapshot",
        });

        return renderList(ctx, serverId, 1);
      }),
  },
};
