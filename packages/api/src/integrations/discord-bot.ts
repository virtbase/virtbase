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

import { buildInviteUrl } from "@virtbase/integration-discord/utils";
import { integrationConfigStore } from "./index";

/** What the customer portal needs to advertise the bot. */
export interface DiscordBotInfo {
  /** The "add to server" URL, built from the configured application id. */
  inviteUrl: string;
}

/**
 * The bot's public details, or `null` when there is no bot to advertise.
 *
 * Lives here rather than in the web app so that the integration's id, its
 * settings shape and the shape of an invite URL stay in one place. The customer
 * portal asks a question — "is there a Discord bot, and where do I add it?" —
 * without knowing how integrations are stored.
 *
 * Returns `null` when the integration is not installed, not enabled, or has no
 * application id yet, so a card built on it simply does not render.
 */
export const getDiscordBotInfo = async (): Promise<DiscordBotInfo | null> => {
  const store = integrationConfigStore;
  if (!store) return null;

  try {
    const installation = await store.find("discord");
    if (!installation?.enabled) return null;

    const appId = (installation.settings as { appId?: unknown }).appId;
    if (typeof appId !== "string" || appId.length === 0) return null;

    return { inviteUrl: buildInviteUrl(appId) };
  } catch {
    // A card advertising the bot is not worth failing an account page over.
    return null;
  }
};
