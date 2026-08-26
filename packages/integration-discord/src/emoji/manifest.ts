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

import { OPERATING_SYSTEMS } from "@virtbase/utils";

/**
 * One application emoji this package owns.
 *
 * Derived from the shared operating system catalog rather than listed here, so
 * the bot's logos and the dashboard's cannot drift apart: a distribution added
 * to the catalog gets a Discord emoji by re-running the rasterizer, and one
 * removed from it stops being uploaded.
 */
export interface EmojiDescriptor {
  /** Discord emoji name: alphanumeric and underscores, 2-32 characters. */
  name: string;
  /** File under `assets/emoji`, produced by `scripts/rasterize-emojis.ts`. */
  file: string;
  /** The catalog slug this emoji renders. */
  slug: string;
}

/**
 * Prefix for every emoji this package uploads.
 *
 * The reconciler only ever deletes names carrying it, so an emoji added by
 * hand in the developer portal survives a sync.
 */
export const EMOJI_PREFIX = "vb_";

/** The emoji name for a catalog slug. */
export const emojiNameForSlug = (slug: string) => `${EMOJI_PREFIX}${slug}`;

export const EMOJI_MANIFEST: EmojiDescriptor[] = OPERATING_SYSTEMS.map(
  ({ slug }) => ({
    name: emojiNameForSlug(slug),
    file: `${slug}.png`,
    slug,
  }),
);
