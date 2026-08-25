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
  ManagedFirewallOptions,
  ManagedFirewallRule,
} from "@virtbase/ports";
import { ServerManagementError } from "@virtbase/ports";
import type { APIMessageComponentSelectMenuInteraction } from "discord-api-types/v10";
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

/** How many rules fit in an embed before it stops being readable. */
const RULES_SHOWN = 20;

/**
 * One rule as a single line.
 *
 * Proxmox's own ordering — direction, action, protocol, port, source — is what
 * anyone who has read a firewall listing before expects, so it is kept even
 * though a sentence would read more naturally.
 */
const describeRule = (rule: ManagedFirewallRule): string => {
  const parts = [
    rule.enabled === false ? "⏸️" : "▶️",
    `\`${rule.direction ?? "in"}\``,
    `**${rule.action}**`,
    rule.proto && `\`${rule.proto}\``,
    rule.dport && `→ ${rule.dport}`,
    rule.sport && `← ${rule.sport}`,
    rule.icmp_type && `\`${rule.icmp_type}\``,
    rule.source && `from \`${rule.source}\``,
    rule.dest && `to \`${rule.dest}\``,
  ].filter((part): part is string => typeof part === "string");

  return [parts.join(" "), rule.comment && `— ${rule.comment}`]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
};

const FirewallMessage = async ({
  locale,
  serverId,
  options,
  rules,
}: {
  locale: Locale;
  serverId: string;
  options: ManagedFirewallOptions;
  rules: ManagedFirewallRule[];
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  const shown = rules.slice(0, RULES_SHOWN);

  return message({
    type: InteractionResponseType.UpdateMessage,
    embeds: [
      await createEmbed({
        locale,
        title: t("Firewall"),
        description: [
          t(
            "The firewall is always on. These are the default actions applied to anything no rule below matches.",
          ),
          "",
          t("Incoming: **{incoming}** · Outgoing: **{outgoing}**", {
            incoming: options.policy_in ?? "ACCEPT",
            outgoing: options.policy_out ?? "ACCEPT",
          }),
        ].join("\n"),
        ...(rules.length > shown.length
          ? {
              footer: {
                text: t(
                  "Showing {shown} of {total} rules. Manage the rest in the portal.",
                  {
                    shown: String(shown.length),
                    total: String(rules.length),
                  },
                ),
              },
            }
          : {}),
        fields:
          shown.length === 0
            ? [
                {
                  name: t("No rules"),
                  value: t(
                    "This server has no firewall rules. With the firewall on and no rules, the default policies above decide everything.",
                  ),
                },
              ]
            : [
                {
                  name: t("Rules"),
                  value: shown
                    .map((rule) => `\`${rule.pos}\` ${describeRule(rule)}`)
                    .join("\n"),
                },
              ],
      }),
    ],
    components: [
      row(
        shown.length > 0 &&
          select({
            feature: "firewall",
            action: "pick",
            params: [serverId],
            placeholder: t("Select a rule to delete"),
            options: shown.map((rule) => ({
              label:
                `#${rule.pos} ${rule.action} ${rule.proto ?? ""} ${rule.dport ?? ""}`.trim(),
              value: String(rule.pos),
              description: rule.comment || describeRule(rule).slice(0, 100),
            })),
          }),
      ),
      row(
        actionButton({
          feature: "firewall",
          action: "policies",
          params: [serverId],
          label: t("Default policies"),
          emoji: EMOJI.advanced,
        }),
        actionButton({
          feature: "firewall",
          action: "add",
          params: [serverId],
          label: t("Add rule"),
          emoji: EMOJI.add,
          style: ButtonStyle.Primary,
        }),
        actionButton({
          feature: "firewall",
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

const renderFirewall = async (
  ctx: Pick<LinkedInteractionContext, "locale" | "user" | "servers">,
  serverId: string,
): Promise<MessageResponse> => {
  const actor = actorFor(ctx.user);

  const [{ options }, { rules }] = await Promise.all([
    ctx.servers.firewall.options.get(actor, { server_id: serverId }),
    ctx.servers.firewall.rules.list(actor, { server_id: serverId }),
  ]);

  return FirewallMessage({ locale: ctx.locale, serverId, options, rules });
};

/**
 * The Proxmox firewall.
 *
 * Every mutation re-reads the rules first so it can send back the `digest`
 * Proxmox handed out. Proxmox rejects a write carrying a stale digest, which
 * is what stops a rule added from the portal a second earlier from being
 * clobbered by one added here.
 */
export const firewallFeature: DiscordFeature = {
  id: "firewall",

  buttons: {
    menu: (ctx) =>
      ctx.deferred(() => renderFirewall(ctx, requireServerId(ctx)), {
        update: true,
      }),

    policies: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);
          const { options } = await ctx.servers.firewall.options.get(
            actorFor(ctx.user),
            { server_id: serverId },
          );

          return PoliciesMessage({ locale: ctx.locale, serverId, options });
        },
        { update: true },
      ),

    add: async (ctx) => {
      const serverId = requireServerId(ctx);
      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      return modal({
        feature: "firewall",
        action: "add",
        params: [serverId],
        title: t("Add firewall rule"),
        fields: [
          {
            id: "action",
            label: t("Action"),
            description: t(
              "ACCEPT, DROP or REJECT. Added at the top, so it is checked first.",
            ),
            placeholder: "ACCEPT",
            value: "ACCEPT",
            maxLength: 6,
          },
          {
            id: "proto",
            label: t("Protocol"),
            description: t("For example tcp, udp or icmp."),
            placeholder: "tcp",
            maxLength: 16,
          },
          {
            id: "dport",
            label: t("Destination port"),
            description: t("A port, a range like 8000:8100, or leave empty."),
            placeholder: "443",
            required: false,
            maxLength: 32,
          },
          {
            id: "source",
            label: t("Source address"),
            description: t("An address or network. Empty means anywhere."),
            placeholder: "10.0.0.0/8",
            required: false,
            maxLength: 64,
          },
          {
            id: "comment",
            label: t("Comment"),
            description: t("What this rule is for."),
            placeholder: t("Allow HTTPS"),
            required: false,
            maxLength: 64,
          },
        ],
      });
    },

    "delete-confirm": async (ctx) => {
      const serverId = requireServerId(ctx);
      const pos = requirePosition(ctx);
      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      return ConfirmMessage({
        locale: ctx.locale,
        title: t("Delete this firewall rule?"),
        description: t(
          "Rule #{pos} will be removed. If it was the rule allowing your own access, you may lock yourself out.",
          { pos },
        ),
        confirmLabel: t("Delete rule"),
        confirm: {
          feature: "firewall",
          action: "delete",
          params: [serverId, pos],
        },
        cancel: { feature: "firewall", action: "menu", params: [serverId] },
      });
    },

    delete: (ctx) =>
      ctx.deferred(
        async () => {
          const serverId = requireServerId(ctx);
          const actor = actorFor(ctx.user);
          const pos = Number(requirePosition(ctx));

          // Re-read for the digest: it is Proxmox's optimistic lock, and the
          // one taken when this screen was drawn may be several minutes old.
          const { rules } = await ctx.servers.firewall.rules.list(actor, {
            server_id: serverId,
          });
          const rule = rules.find((candidate) => candidate.pos === pos);

          if (!rule) {
            throw new ServerManagementError(
              "not_found",
              `No firewall rule at position ${pos}`,
            );
          }

          await ctx.servers.firewall.rules.delete(actor, {
            server_id: serverId,
            pos,
            digest: rule.digest,
          });

          return renderFirewall(ctx, serverId);
        },
        { update: true },
      ),
  },

  selects: {
    "policy-in": (ctx) => setPolicy(ctx, "policy_in"),
    "policy-out": (ctx) => setPolicy(ctx, "policy_out"),

    pick: async (ctx) => {
      const serverId = requireServerId(ctx);
      const [pos] = ctx.interaction.data.values;

      if (!pos) {
        throw new ServerManagementError(
          "invalid_input",
          "No rule was selected",
        );
      }

      const t = await getExtracted({
        namespace: "discord-integration",
        locale: ctx.locale,
      });

      return ConfirmMessage({
        locale: ctx.locale,
        title: t("Delete this firewall rule?"),
        description: t(
          "Rule #{pos} will be removed. If it was the rule allowing your own access, you may lock yourself out.",
          { pos },
        ),
        confirmLabel: t("Delete rule"),
        confirm: {
          feature: "firewall",
          action: "delete",
          params: [serverId, pos],
        },
        cancel: { feature: "firewall", action: "menu", params: [serverId] },
      });
    },
  },

  modals: {
    add: (ctx) =>
      ctx.deferred(async () => {
        const serverId = requireServerId(ctx);
        const actor = actorFor(ctx.user);
        const read = (id: string) =>
          modalValue(ctx.interaction.data.components, id)?.trim() || undefined;

        const action = read("action")?.toUpperCase();
        if (action !== "ACCEPT" && action !== "DROP" && action !== "REJECT") {
          throw new ServerManagementError(
            "invalid_input",
            "The action has to be ACCEPT, DROP or REJECT",
          );
        }

        const { rules } = await ctx.servers.firewall.rules.list(actor, {
          server_id: serverId,
        });

        await ctx.servers.firewall.rules.create(actor, {
          server_id: serverId,
          // Position 0 is the top of the list: a rule a customer just wrote
          // is no use below a broader one that already matched.
          pos: 0,
          enabled: true,
          direction: "in",
          action,
          proto: read("proto")?.toLowerCase() as never,
          dport: read("dport"),
          source: read("source") as never,
          comment: read("comment"),
          digest: rules[0]?.digest,
        });

        return renderFirewall(ctx, serverId);
      }),
  },
};

/** The three actions Proxmox accepts as a default policy. */
const POLICIES = ["ACCEPT", "DROP", "REJECT"] as const;

type Policy = (typeof POLICIES)[number];

const PoliciesMessage = async ({
  locale,
  serverId,
  options,
}: {
  locale: Locale;
  serverId: string;
  options: ManagedFirewallOptions;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  const describe: Record<Policy, string> = {
    ACCEPT: t("Allow the packet through"),
    DROP: t("Discard it silently"),
    REJECT: t("Discard it and tell the sender"),
  };

  const policyOptions = (current: string | undefined) =>
    POLICIES.map((policy) => ({
      label: `${policy === current ? "\u25cf " : ""}${policy}`,
      value: policy,
      description: describe[policy],
    }));

  return message({
    type: InteractionResponseType.UpdateMessage,
    embeds: [
      await createEmbed({
        locale,
        title: t("Default policies"),
        description: t(
          "What happens to a packet that no rule matches. Leave incoming on **DROP** unless you know why you are changing it.",
        ),
        fields: [
          {
            name: t("Incoming packets"),
            value: `**${options.policy_in ?? "ACCEPT"}**`,
          },
          {
            name: t("Outgoing packets"),
            value: `**${options.policy_out ?? "ACCEPT"}**`,
          },
        ],
      }),
    ],
    components: [
      row(
        select({
          feature: "firewall",
          action: "policy-in",
          params: [serverId],
          placeholder: t("Default action for incoming packets"),
          options: policyOptions(options.policy_in),
        }),
      ),
      row(
        select({
          feature: "firewall",
          action: "policy-out",
          params: [serverId],
          placeholder: t("Default action for outgoing packets"),
          options: policyOptions(options.policy_out),
        }),
      ),
      row(
        actionButton({
          feature: "firewall",
          action: "menu",
          params: [serverId],
          label: t("Back to firewall"),
          emoji: EMOJI.back,
        }),
      ),
    ],
  });
};

/**
 * Writes one of the two default policies.
 *
 * The update endpoint takes both, so the other one is read back and sent
 * unchanged — omitting it would reset it to the schema's default rather than
 * leaving it alone.
 */
const setPolicy = (
  ctx: LinkedInteractionContext<APIMessageComponentSelectMenuInteraction>,
  field: "policy_in" | "policy_out",
) =>
  ctx.deferred(
    async () => {
      const serverId = requireServerId(ctx);
      const actor = actorFor(ctx.user);
      const [chosen] = ctx.interaction.data.values;

      if (!chosen || !POLICIES.includes(chosen as Policy)) {
        throw new ServerManagementError(
          "invalid_input",
          `"${chosen}" is not a firewall policy`,
        );
      }

      const { options } = await ctx.servers.firewall.options.get(actor, {
        server_id: serverId,
      });

      await ctx.servers.firewall.options.update(actor, {
        server_id: serverId,
        policy_in: options.policy_in,
        policy_out: options.policy_out,
        [field]: chosen as Policy,
      });

      return renderFirewall(ctx, serverId);
    },
    { update: true },
  );

const requirePosition = (ctx: { params: string[] }): string => {
  const pos = ctx.params[1];
  if (pos === undefined) {
    throw new Error(
      "[@virtbase/discord] Expected the component's custom id to carry a rule position",
    );
  }
  return pos;
};
