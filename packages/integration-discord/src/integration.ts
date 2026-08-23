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
import { secretsSchema, settingsSchema } from "./config";
import { DiscordIdentityProvider } from "./identity";
import { localizeDiscord } from "./localize";
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

  health: async (ctx) => {
    const response = await fetch(
      "https://discord.com/api/v10/applications/@me",
      { headers: { Authorization: `Bot ${ctx.secrets.botToken}` } },
    );

    if (!response.ok) {
      return {
        status: "error",
        checkedAt: new Date(),
        message: `Discord API returned ${response.status} ${response.statusText}`,
      };
    }

    const application = (await response.json()) as { id?: string };
    if (application.id !== ctx.settings.appId) {
      return {
        status: "degraded",
        checkedAt: new Date(),
        message:
          "The bot token belongs to a different application than the configured Application ID.",
      };
    }

    return { status: "ok", checkedAt: new Date() };
  },
});
