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

import { defineIntegration } from "@virtbase/integration-sdk";
import { createDiscordClient, getApplication } from "./api";
import { secretsSchema, settingsSchema } from "./config";
import { DiscordIdentityProvider } from "./identity";
import { localizeDiscord } from "./localize";
import { runDiscordSync, summarizeSync } from "./sync";
import { handleInteractionsRequest } from "./webhooks/interactions";

export default defineIntegration({
  id: "discord",
  name: "Discord",
  description:
    "Server management from Discord, and account linking via Discord.",

  category: "communication",
  icon: "discord",
  author: "Virtbase",
  website: "https://discord.com",
  docsUrl: "https://discord.com/developers/docs/intro",

  settings: {
    schema: settingsSchema,
    fields: [
      {
        key: "appId",
        label: "Application ID",
        help: "Found under General Information in the Discord developer portal.",
        widget: "text",
      },
    ],
  },

  secrets: {
    schema: secretsSchema,
    fields: [
      {
        key: "botToken",
        label: "Bot token",
        widget: "password",
      },
      {
        key: "publicKey",
        label: "Public key",
        help: "Used to verify that interaction requests really came from Discord.",
        widget: "password",
      },
    ],
  },

  // `notifications` follows once NotificationChannel has a dispatcher. Discord
  // also consumes `serverManagement` rather than providing it.
  provides: {
    identity: (ctx) => new DiscordIdentityProvider(ctx),
  },

  webhooks: [
    {
      path: "interactions",
      methods: ["POST"],
      handler: handleInteractionsRequest,
    },
  ],

  localize: localizeDiscord,

  /**
   * Registers the slash commands, role-connection metadata and emojis.
   *
   * This is the whole setup: an admin fills in the credentials and flips the
   * switch, and there is no script left to remember to run.
   */
  onEnable: async (ctx) => {
    const results = await runDiscordSync(ctx);

    const failed = results.filter((result) => result.error);
    if (failed.length > 0) {
      // Surfaced to the admin who pressed the switch, which is the only moment
      // anyone is watching. The integration stays enabled: the health cron
      // retries, and a half-registered bot is still better than none.
      throw new Error(summarizeSync(results));
    }
  },

  health: async (ctx) => {
    const client = createDiscordClient({
      appId: ctx.settings.appId,
      botToken: ctx.secrets.botToken,
      logger: ctx.logger,
    });

    let application: { id?: string };
    try {
      application = await getApplication(client);
    } catch (error) {
      return {
        status: "error",
        checkedAt: new Date(),
        message: error instanceof Error ? error.message : String(error),
      };
    }

    if (application.id !== ctx.settings.appId) {
      return {
        status: "degraded",
        checkedAt: new Date(),
        message:
          "The bot token belongs to a different application than the configured Application ID.",
      };
    }

    // Registration is verified on every probe rather than only on enable, so
    // a command deleted in the developer portal or added by a deployment is
    // repaired within the health cron's half hour.
    const results = await runDiscordSync(ctx);
    const summary = summarizeSync(results);

    if (results.some((result) => result.error)) {
      return { status: "degraded", checkedAt: new Date(), message: summary };
    }

    return {
      status: "ok",
      checkedAt: new Date(),
      ...(summary ? { message: summary } : {}),
    };
  },
});
