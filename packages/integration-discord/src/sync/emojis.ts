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

import { createEmoji, deleteEmoji, listEmojis } from "../api";
import { invalidateEmojiCache } from "../emoji/cache";
import { EMOJI_MANIFEST, EMOJI_PREFIX } from "../emoji/manifest";
import type { Reconciler } from "./types";

/**
 * Uploads the distro logos the bot renders next to a server's operating system.
 *
 * Application emojis belong to the app rather than to a server, so they render
 * in every guild the bot answers in and in DMs, with no per-guild upload.
 *
 * Only names carrying {@link EMOJI_PREFIX} are ever deleted. An application can
 * hold 2000 emojis and something else may well be using them; a sync of this
 * package's 14 must not clear out someone else's.
 */
export const reconcileEmojis: Reconciler = async (client) => {
  const live = await listEmojis(client);
  const liveByName = new Map(
    live
      .filter((emoji) => emoji.name)
      .map((emoji) => [emoji.name as string, emoji]),
  );

  const missing = EMOJI_MANIFEST.filter(
    (descriptor) => !liveByName.has(descriptor.name),
  );

  const declared = new Set(EMOJI_MANIFEST.map((entry) => entry.name));
  const orphaned = live.filter(
    (emoji) =>
      emoji.id &&
      emoji.name?.startsWith(EMOJI_PREFIX) &&
      !declared.has(emoji.name),
  );

  if (missing.length === 0 && orphaned.length === 0) {
    return { name: "emojis", changed: false };
  }

  // Imported here rather than at the top: the images are ~100 KB of base64 and
  // this module is reachable from the web app's import graph. A dynamic import
  // keeps them in their own chunk, loaded only when there is an upload to do.
  const { EMOJI_IMAGES } = await import("../emoji/images.generated");

  for (const descriptor of missing) {
    const image = EMOJI_IMAGES[descriptor.file];
    if (!image) {
      // A manifest entry whose artwork was never generated. Skipping is right —
      // the other thirteen still upload — but it must not be silent.
      throw new Error(
        `No generated image for "${descriptor.file}". Run \`bun run discord:emojis\`.`,
      );
    }

    await createEmoji(client, { name: descriptor.name, image });
  }

  for (const emoji of orphaned) {
    await deleteEmoji(client, emoji.id as string);
  }

  // The resolver caches the list; without this an emoji uploaded a moment ago
  // would not render until the cache expired.
  invalidateEmojiCache();

  return {
    name: "emojis",
    changed: true,
    detail: [
      missing.length > 0 && `uploaded ${missing.length}`,
      orphaned.length > 0 && `removed ${orphaned.length}`,
    ]
      .filter((part): part is string => typeof part === "string")
      .join(", "),
  };
};
