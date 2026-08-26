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
  ManagedAdvancedSettings,
  ManagedIsoImage,
  ManagedServer,
  ManagedServerPlan,
  ManagedTemplateGroup,
} from "@virtbase/ports";
import { ServerManagementError } from "@virtbase/ports";
import { APP_DOMAIN, formatBytes, truncate } from "@virtbase/utils";
import type { APIMessageComponentSelectMenuInteraction } from "discord-api-types/v10";
import { ButtonStyle, InteractionResponseType } from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted, getFormatter } from "next-intl/server";

import type { EmojiResolver } from "../../emoji";
import type { LinkedInteractionContext } from "../../handlers/types";
import { actionButton, linkButton, row, select } from "../../ui/components";
import { ConfirmMessage } from "../../ui/confirm";
import { EMOJI } from "../../ui/emoji";
import { escapeMarkdown, timestamp } from "../../ui/format";
import type { MessageResponse } from "../../ui/message";
import { message } from "../../ui/message";
import { modal, modalValue } from "../../ui/modal";
import { actorFor } from "../../utils/actor";
import { createEmbed } from "../../utils/create-embed";
import { requireServerId } from "../servers";
import type { DiscordFeature } from "../types";

const SettingsMessage = async ({
  locale,
  server,
  emojis,
}: {
  locale: Locale;
  server: ManagedServer;
  emojis: EmojiResolver;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });
  // A partial server - a fixture, or a future field that has not shipped -
  // must cost the logo, never the screen.
  const operatingSystem = server.operating_system ?? null;

  return message({
    type: InteractionResponseType.UpdateMessage,
    embeds: [
      await createEmbed({
        locale,
        title: t("Settings — {name}", {
          name: truncate(server.name, 180) as string,
        }),
        description: t("Everything that changes what this server is."),
        fields: [
          { name: t("Name"), value: server.name },
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
        ],
      }),
    ],
    components: [
      row(
        actionButton({
          feature: "lifecycle",
          action: "rename",
          params: [server.id],
          label: t("Rename"),
          emoji: EMOJI.edit,
        }),
        actionButton({
          feature: "lifecycle",
          action: "plan",
          params: [server.id],
          label: t("Plan"),
          emoji: EMOJI.plan,
        }),
        actionButton({
          feature: "lifecycle",
          action: "iso",
          params: [server.id],
          label: t("Installer image"),
          emoji: EMOJI.disc,
        }),
        actionButton({
          feature: "lifecycle",
          action: "advanced",
          params: [server.id],
          label: t("Advanced"),
          emoji: EMOJI.advanced,
        }),
      ),
      row(
        actionButton({
          feature: "lifecycle",
          action: "reinstall",
          params: [server.id],
          label: t("Reinstall"),
          emoji: EMOJI.restore,
          style: ButtonStyle.Danger,
        }),
      ),
      row(
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

const PlanMessage = async ({
  locale,
  serverId,
  plans,
}: {
  locale: Locale;
  serverId: string;
  plans: ManagedServerPlan[];
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });
  const formatter = await getFormatter({ locale });

  const current = plans.find((plan) => plan.current);
  const price = (cents: number) =>
    formatter.number(cents / 100, { style: "currency", currency: "EUR" });

  const upgrades = plans.filter(
    (plan) =>
      !plan.current &&
      plan.available &&
      // Storage is what makes a move impossible rather than merely unwise: a
      // provisioned disk cannot shrink.
      (!current || plan.storage >= current.storage),
  );

  return message({
    type: InteractionResponseType.UpdateMessage,
    embeds: [
      await createEmbed({
        locale,
        title: t("Plan"),
        description: current
          ? t(
              "You are on **{name}** — {cores, plural, =1 {# vCore} other {# vCores}}, {memory} RAM, {storage} storage.",
              {
                name: current.name,
                cores: current.cores,
                memory: formatBytes(current.memory * 1024 * 1024, {
                  formatter,
                }),
                storage: formatBytes(current.storage * 1024 * 1024 * 1024, {
                  formatter,
                }),
              },
            )
          : t("This server's plan could not be determined."),
        fields: [
          ...(current
            ? [
                {
                  name: t("Renews at"),
                  value: price(current.renewal_price),
                },
              ]
            : []),
          // Only plans that are actually a step up. The API returns the whole
          // catalogue, and a plan with less storage than the current one cannot
          // be moved to at all — the disk is already provisioned — which is the
          // same rule the portal disables those rows with. Listing them under
          // "upgrades" offered customers something they could not buy.
          ...(upgrades.length > 0
            ? [
                {
                  name: t("Upgrades available"),
                  value: upgrades
                    .slice(0, 8)
                    .map(
                      (plan) =>
                        `**${plan.name}** — ${price(plan.renewal_price)}${
                          plan.upgrade_price === null
                            ? ""
                            : t(" (upgrade today for {price})", {
                                price: price(plan.upgrade_price),
                              })
                        }`,
                    )
                    .join("\n"),
                },
              ]
            : []),
        ],
      }),
    ],
    components: [
      row(
        linkButton({
          url: `${APP_DOMAIN}/servers/${serverId}/plan`,
          label: t("Change plan or renew"),
          emoji: EMOJI.external,
        }),
        actionButton({
          feature: "lifecycle",
          action: "menu",
          params: [serverId],
          label: t("Back to settings"),
          emoji: EMOJI.back,
        }),
      ),
    ],
  });
};

const IsoMessage = async ({
  locale,
  serverId,
  images,
  mounted,
}: {
  locale: Locale;
  serverId: string;
  images: ManagedIsoImage[];
  /** What is currently attached, as `servers.get` reports it. */
  mounted: ManagedServer["mount"];
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  // An image is only mountable once its download has settled successfully; one
  // still downloading or failed would be rejected by the mount call.
  const ready = images.filter((image) => image.finished_at && !image.failed_at);

  // `mount` is a bare id when the expand was not requested and an object when
  // it was; only the object says anything worth showing.
  const attached =
    typeof mounted === "object" && mounted !== null ? mounted : null;

  return message({
    type: InteractionResponseType.UpdateMessage,
    embeds: [
      await createEmbed({
        locale,
        title: t("Installer image"),
        description: attached
          ? t(
              "**{name}** is mounted. Reboot the server to boot from it, or unmount it to go back to the disk.",
              { name: attached.name },
            )
          : ready.length === 0
            ? t(
                "You have no installer images ready. Add one in the customer portal, then mount it here.",
              )
            : t(
                "Nothing is mounted. Mounting an image attaches it as a virtual disc; reboot the server afterwards to boot from it.",
              ),
        fields: ready.slice(0, 10).map((image) => ({
          name: `${image.id === attached?.id ? `${EMOJI.disc} ` : ""}${truncate(image.name, 200)}`,
          value: t("Expires {when}", {
            when: timestamp(image.expires_at, "R"),
          }),
        })),
      }),
    ],
    components: [
      row(
        ready.length > 0 &&
          select({
            feature: "lifecycle",
            action: "mount",
            params: [serverId],
            placeholder: t("Select an image to mount"),
            options: ready.map((image) => ({
              label: image.name,
              value: image.id,
              description:
                image.id === attached?.id ? t("Currently mounted") : undefined,
            })),
          }),
      ),
      row(
        actionButton({
          feature: "lifecycle",
          action: "unmount",
          params: [serverId],
          label: t("Unmount"),
          emoji: EMOJI.eject,
          disabled: !attached,
        }),
        linkButton({
          url: `${APP_DOMAIN}/account/settings/custom-images`,
          label: t("Manage images"),
          emoji: EMOJI.external,
        }),
      ),
      row(
        actionButton({
          feature: "lifecycle",
          action: "menu",
          params: [serverId],
          label: t("Back to settings"),
          emoji: EMOJI.back,
        }),
      ),
    ],
  });
};

const ReinstallMessage = async ({
  locale,
  serverId,
  groups,
  emojis,
}: {
  locale: Locale;
  serverId: string;
  groups: ManagedTemplateGroup[];
  emojis: EmojiResolver;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  const templates = groups.flatMap((group) =>
    group.templates.map((template) => ({ ...template, group: group.name })),
  );

  return message({
    type: InteractionResponseType.UpdateMessage,
    embeds: [
      await createEmbed({
        locale,
        title: `⚠️ ${t("Reinstall")}`,
        description: t(
          "Choose an operating system to install. **Everything currently on the disk is destroyed** and the server is rebuilt from scratch. Take a backup first if there is anything on it you want to keep.",
        ),
        color: 0xef4444,
      }),
    ],
    components: [
      row(
        templates.length > 0 &&
          select({
            feature: "lifecycle",
            action: "reinstall-pick",
            params: [serverId],
            placeholder: t("Select an operating system"),
            options: templates.map((template) => ({
              label: template.name,
              value: template.id,
              description: template.group,
              emoji: emojis.componentForTemplate(template),
            })),
          }),
      ),
      row(
        actionButton({
          feature: "lifecycle",
          action: "menu",
          params: [serverId],
          label: t("Cancel"),
          emoji: EMOJI.cancel,
        }),
      ),
    ],
  });
};

const AdvancedMessage = async ({
  locale,
  serverId,
  settings,
}: {
  locale: Locale;
  serverId: string;
  settings: ManagedAdvancedSettings;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  const mark = (chosen: boolean) => (chosen ? "\u25cf " : "");

  return message({
    type: InteractionResponseType.UpdateMessage,
    embeds: [
      await createEmbed({
        locale,
        title: t("Advanced"),
        description: t(
          "Firmware settings. Changing either of these reboots the server, and a machine installed under one setting may not boot under the other.",
        ),
        fields: [
          {
            name: t("BIOS"),
            value: settings.bios === "uefi" ? t("UEFI") : t("Legacy BIOS"),
          },
          {
            name: t("TPM"),
            value: settings.tpm ?? t("None"),
          },
        ],
      }),
    ],
    components: [
      row(
        select({
          feature: "lifecycle",
          action: "bios",
          params: [serverId],
          placeholder: t("BIOS"),
          options: [
            {
              label: `${mark(settings.bios !== "uefi")}${t("Legacy BIOS")}`,
              value: "legacy",
              description: t("Use the legacy BIOS for this server."),
            },
            {
              label: `${mark(settings.bios === "uefi")}${t("UEFI BIOS")}`,
              value: "uefi",
              description: t("Use the newer UEFI BIOS for this server."),
            },
          ],
        }),
      ),
      row(
        select({
          feature: "lifecycle",
          action: "tpm",
          params: [serverId],
          placeholder: t("TPM"),
          options: [
            {
              label: `${mark(settings.tpm === null)}${t("No TPM")}`,
              value: "none",
              description: t("No trusted platform module."),
            },
            {
              label: `${mark(settings.tpm === "v2.0")}TPM v2.0`,
              value: "v2.0",
              description: t("Required by Windows 11."),
            },
            {
              label: `${mark(settings.tpm === "v1.2")}TPM v1.2`,
              value: "v1.2",
              description: t("The older revision."),
            },
          ],
        }),
      ),
      row(
        actionButton({
          feature: "lifecycle",
          action: "menu",
          params: [serverId],
          label: t("Back to settings"),
          emoji: EMOJI.back,
        }),
      ),
    ],
  });
};

const renderAdvanced = async (
  ctx: Pick<LinkedInteractionContext, "locale" | "user" | "servers">,
  serverId: string,
): Promise<MessageResponse> => {
  const { settings } = await ctx.servers.lifecycle.advanced.get(
    actorFor(ctx.user),
    { server_id: serverId },
  );

  return AdvancedMessage({ locale: ctx.locale, serverId, settings });
};

const renderIso = async (
  ctx: Pick<LinkedInteractionContext, "locale" | "user" | "servers">,
  serverId: string,
): Promise<MessageResponse> => {
  const actor = actorFor(ctx.user);

  const [{ iso_downloads: images }, { server }] = await Promise.all([
    ctx.servers.mounts.list(actor, {
      page: 1,
      per_page: 25,
      sort: ["id:desc"],
    }),
    ctx.servers.get(actor, { server_id: serverId, expand: ["mount"] }),
  ]);

  return IsoMessage({
    locale: ctx.locale,
    serverId,
    images,
    mounted: server.mount,
  });
};

const renderSettings = async (
  ctx: Pick<LinkedInteractionContext, "locale" | "user" | "servers" | "emojis">,
  serverId: string,
): Promise<MessageResponse> => {
  const { server } = await ctx.servers.get(actorFor(ctx.user), {
    server_id: serverId,
    expand: ["template"],
  });

  return SettingsMessage({ locale: ctx.locale, server, emojis: ctx.emojis });
};

/**
 * Writes one firmware setting.
 *
 * The update endpoint takes both fields and treats an omitted one as "clear",
 * so the other is read back and sent unchanged — dropping a server's TPM
 * because somebody changed its BIOS would be a silent data loss.
 */
const setAdvanced = (
  ctx: LinkedInteractionContext<APIMessageComponentSelectMenuInteraction>,
  field: "bios" | "tpm",
) =>
  ctx.deferred(
    async () => {
      const serverId = requireServerId(ctx);
      const actor = actorFor(ctx.user);
      const [chosen] = ctx.interaction.data.values;

      if (!chosen) {
        throw new ServerManagementError(
          "invalid_input",
          "Nothing was selected",
        );
      }

      const { settings } = await ctx.servers.lifecycle.advanced.get(actor, {
        server_id: serverId,
      });

      await ctx.servers.lifecycle.advanced.update(actor, {
        server_id: serverId,
        bios: settings.bios,
        tpm: settings.tpm,
        // "none" is the select's stand-in for null: a select option's value
        // cannot be empty.
        [field]: chosen === "none" ? null : chosen,
      });

      return renderAdvanced(ctx, serverId);
    },
    { update: true },
  );

const requireTemplateId = (ctx: { params: string[] }): string => {
  const templateId = ctx.params[1];
  if (!templateId) {
    throw new Error(
      "[@virtbase/discord] Expected the component's custom id to carry a template id",
    );
  }
  return templateId;
};

/**
 * Everything that changes what the server is rather than what it is doing.
 *
 * Reinstalling is the one action here that destroys data, so it is the only one
 * that asks twice — once to pick the operating system, once to confirm — and it
 * takes a root password on the way, because the rebuilt machine needs one.
 */
export const lifecycleFeature: DiscordFeature = {
  id: "lifecycle",

  buttons: {
    menu: (ctx) =>
      ctx.deferred(() => renderSettings(ctx, requireServerId(ctx)), {
        update: true,
      }),

    rename: async (ctx) => {
      const serverId = requireServerId(ctx);
      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      return modal({
        feature: "lifecycle",
        action: "rename",
        params: [serverId],
        title: t("Rename server"),
        fields: [
          {
            id: "name",
            label: t("Name"),
            description: t("How this server is labelled in Virtbase."),
            minLength: 1,
            maxLength: 64,
          },
        ],
      });
    },

    advanced: (ctx) =>
      ctx.deferred(() => renderAdvanced(ctx, requireServerId(ctx)), {
        update: true,
      }),

    plan: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);
          const { plans } = await ctx.servers.lifecycle.plan(
            actorFor(ctx.user),
            { server_id: serverId },
          );

          return PlanMessage({ locale: ctx.locale, serverId, plans });
        },
        { update: true },
      ),

    iso: (ctx) =>
      ctx.deferred(() => renderIso(ctx, requireServerId(ctx)), {
        update: true,
      }),

    unmount: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);

          await ctx.servers.mounts.unmount(actorFor(ctx.user), {
            server_id: serverId,
          });

          return renderIso(ctx, serverId);
        },
        { update: true },
      ),

    reinstall: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);
          const { template_groups: groups } =
            await ctx.servers.lifecycle.templateGroups(actorFor(ctx.user), {
              server_id: serverId,
            });

          return ReinstallMessage({
            locale: ctx.locale,
            serverId,
            groups,
            emojis: ctx.emojis,
          });
        },
        { update: true },
      ),

    /** Second step of the reinstall: the password the rebuilt machine gets. */
    "reinstall-confirm": async (ctx) => {
      const serverId = requireServerId(ctx);
      const templateId = requireTemplateId(ctx);
      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      return modal({
        feature: "lifecycle",
        action: "reinstall",
        params: [serverId, templateId],
        title: t("Reinstall server"),
        note: t(
          "Everything on the disk will be destroyed. Type the new root password to continue.",
        ),
        fields: [
          {
            id: "password",
            label: t("Root password"),
            description: t(
              "One uppercase letter, one lowercase letter, one number, and 8 characters minimum.",
            ),
            placeholder: "********",
            minLength: 8,
            maxLength: 64,
          },
        ],
      });
    },
  },

  selects: {
    bios: (ctx) => setAdvanced(ctx, "bios"),
    tpm: (ctx) => setAdvanced(ctx, "tpm"),

    mount: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);
          const [imageId] = ctx.interaction.data.values;

          if (!imageId) {
            throw new ServerManagementError(
              "invalid_input",
              "No image was selected",
            );
          }

          await ctx.servers.mounts.mount(actorFor(ctx.user), {
            server_id: serverId,
            iso_download_id: imageId,
          });

          return renderIso(ctx, serverId);
        },
        { update: true },
      ),

    "reinstall-pick": async (ctx) => {
      const serverId = requireServerId(ctx);
      const [templateId] = ctx.interaction.data.values;

      if (!templateId) {
        throw new ServerManagementError(
          "invalid_input",
          "No operating system was selected",
        );
      }

      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      return ConfirmMessage({
        locale: ctx.locale,
        title: t("Reinstall this server?"),
        description: t(
          "The disk is wiped and the operating system installed from scratch. Backups are kept, but everything on the running server is lost.",
        ),
        confirmLabel: t("Choose a password"),
        confirm: {
          feature: "lifecycle",
          action: "reinstall-confirm",
          params: [serverId, templateId],
        },
        cancel: { feature: "lifecycle", action: "menu", params: [serverId] },
      });
    },
  },

  modals: {
    rename: (ctx) =>
      ctx.deferred(async () => {
        const serverId = requireServerId(ctx);
        const name = modalValue(
          ctx.interaction.data.components,
          "name",
        )?.trim();

        if (!name) {
          throw new ServerManagementError(
            "invalid_input",
            "The server needs a name",
          );
        }

        await ctx.servers.lifecycle.rename(actorFor(ctx.user), {
          server_id: serverId,
          name,
        });

        return renderSettings(ctx, serverId);
      }),

    reinstall: (ctx) =>
      ctx.deferred(async () => {
        const serverId = requireServerId(ctx);
        const password = modalValue(
          ctx.interaction.data.components,
          "password",
        );

        if (!password) {
          throw new ServerManagementError(
            "invalid_input",
            "A root password is required",
          );
        }

        await ctx.servers.lifecycle.changeTemplate(actorFor(ctx.user), {
          server_id: serverId,
          template_id: requireTemplateId(ctx),
          root_password: password,
        });

        return renderSettings(ctx, serverId);
      }),
  },
};
