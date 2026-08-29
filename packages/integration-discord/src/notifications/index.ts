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

import { and, eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { accounts } from "@virtbase/db/schema";
import type {
  Notification,
  NotificationAudience,
  NotificationChannel,
  NotificationReceipt,
  NotificationSeverity,
} from "@virtbase/ports";
import type { FieldDescriptor } from "@virtbase/validators";
import type { APIEmbed } from "discord-api-types/v10";
import { createDiscordClient } from "../api";
import type { DiscordContext } from "../config";
import { escapeMarkdown } from "../ui/format";

/** Discord's own palette, so a notification looks native next to the bot. */
const SEVERITY_COLOR: Record<NotificationSeverity, number> = {
  info: 0x5865f2,
  warning: 0xf0b232,
  critical: 0xda373c,
};

/** Embed titles are capped at 256 and descriptions at 4096. */
const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

/**
 * The Discord account linked to a Virtbase user, if there is one.
 *
 * Read straight from `accounts`, the way `getUserByInteraction` already does:
 * an integration may depend on Layer 1, and routing a DM is exactly the kind
 * of question only the linking table can answer.
 */
const findLinkedAccountId = async (userId: string): Promise<string | null> => {
  const row = await db
    .select({ accountId: accounts.accountId })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "discord")))
    .limit(1)
    .then(([first]) => first);

  return row?.accountId ?? null;
};

/**
 * Discord, both ways round.
 *
 * A customer who linked their account gets a direct message; the operators get
 * a channel webhook. Two very different transports behind one channel,
 * because from the dispatcher's side they are the same question - can you
 * reach this audience, and here is what to say.
 */
export class DiscordNotificationChannel implements NotificationChannel {
  readonly id = "discord";

  readonly targetFields: FieldDescriptor[] = [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      help: "Server Settings → Integrations → Webhooks. Treat it as a password: anyone holding it can post to the channel.",
      widget: "password",
    },
  ];

  readonly targetSecretKeys = ["webhookUrl"] as const;

  private readonly ctx: DiscordContext;

  constructor(ctx: DiscordContext) {
    this.ctx = ctx;
  }

  async supports(audience: NotificationAudience): Promise<boolean> {
    if ("operator" === audience.kind) return true;
    return null !== (await findLinkedAccountId(audience.userId));
  }

  async send(notification: Notification): Promise<NotificationReceipt> {
    const embed = this.embed(notification);

    if ("operator" === notification.audience.kind) {
      const webhookUrl = notification.target?.webhookUrl;
      if ("string" !== typeof webhookUrl || 0 === webhookUrl.length) {
        throw new Error(
          "This Discord target has no webhook URL configured. Add one in the notification settings.",
        );
      }

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });

      if (!response.ok) {
        throw new Error(
          `Discord webhook rejected the message with ${response.status}: ${await response
            .text()
            .catch(() => "")}`,
        );
      }

      return {};
    }

    const accountId = await findLinkedAccountId(notification.audience.userId);
    if (!accountId) {
      throw new Error(
        `User "${notification.audience.userId}" has no linked Discord account.`,
      );
    }

    const client = createDiscordClient({
      appId: this.ctx.settings.appId,
      botToken: this.ctx.secrets.botToken,
      logger: this.ctx.logger,
    });

    // A DM needs a channel first, and Discord returns the existing one rather
    // than opening a second, so this is safe to call on every message.
    const channel = await client.request<{ id: string }>(
      "POST",
      "/users/@me/channels",
      { recipient_id: accountId },
    );

    const message = await client.request<{ id: string }>(
      "POST",
      `/channels/${channel.id}/messages`,
      { embeds: [embed] },
    );

    return { externalId: message.id };
  }

  /**
   * [!] `title` and `body` may carry reporter-supplied text. Discord renders
   * markdown in both, so they are escaped here rather than trusted - the same
   * rule that applies to a guest-reported operating system name.
   */
  private embed(notification: Notification): APIEmbed {
    const title = String(notification.params.title ?? notification.key);
    const body = String(notification.params.body ?? "");

    return {
      color: SEVERITY_COLOR[notification.severity],
      title: truncate(escapeMarkdown(title), 256),
      ...(body ? { description: truncate(escapeMarkdown(body), 4096) } : {}),
      ...(notification.url ? { url: notification.url } : {}),
      timestamp: notification.occurredAt.toISOString(),
    };
  }
}
