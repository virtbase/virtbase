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

import type { DiscordClient } from "../api";
import type { EmojiResolver } from "./resolver";
import { createEmojiResolver, emptyEmojiResolver } from "./resolver";

/**
 * How long a fetched emoji list is reused. The set only changes when the sync
 * uploads one, and that invalidates this cache directly — the expiry is a
 * backstop for the other instances, which never saw the upload.
 */
const TTL_MS = 10 * 60 * 1000;

let cached: { resolver: EmojiResolver; expiresAt: number } | null = null;
let refreshing: Promise<void> | null = null;

/**
 * The emoji resolver, without ever making the caller wait for Discord.
 *
 * This is deliberately synchronous. An interaction has three seconds to be
 * acknowledged, and fetching the emoji list on every one spent a network round
 * trip to discord.com before a handler had even started — which is what made
 * the bot answer "did not respond in time".
 *
 * A cold or stale cache starts a refresh in the background and answers with
 * what is available now. The first interaction after a boot therefore renders
 * without distro logos and every one after it has them. That is the right
 * trade: the logos are decoration, and answering in time is not.
 */
export const getEmojiResolver = (
  client: DiscordClient,
  logger?: { warn(message: string, fields?: Record<string, unknown>): void },
): EmojiResolver => {
  if (!cached || cached.expiresAt <= Date.now()) {
    // Deliberately not awaited: waiting for it is the bug this exists to fix.
    // `refreshEmojiCache` never rejects.
    void refreshEmojiCache(client, logger);
  }

  return cached?.resolver ?? emptyEmojiResolver;
};

/**
 * Refetches the list, at most once at a time.
 *
 * Never rejects: a failed refresh leaves the previous resolver in place, and
 * the next interaction tries again.
 */
export const refreshEmojiCache = (
  client: DiscordClient,
  logger?: { warn(message: string, fields?: Record<string, unknown>): void },
): Promise<void> => {
  refreshing ??= createEmojiResolver(client, logger)
    .then((resolver) => {
      cached = { resolver, expiresAt: Date.now() + TTL_MS };
    })
    .catch(() => {
      // `createEmojiResolver` already logs and degrades to the empty resolver;
      // there is nothing left to do but let the next call try again.
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
};

/** Drops the cache so the next interaction picks up a freshly uploaded emoji. */
export const invalidateEmojiCache = (): void => {
  cached = null;
};
