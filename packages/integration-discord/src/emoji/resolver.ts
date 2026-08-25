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

import type { APIEmoji, APIMessageComponentEmoji } from "discord-api-types/v10";
import type { DiscordClient } from "../api";
import { listEmojis } from "../api";
import { EMOJI_MANIFEST } from "./manifest";

/** What a template's logo is looked up from: its name, or its icon path. */
type TemplateLike =
  | { name?: string | null; icon?: string | null }
  | null
  | undefined;

/**
 * Turns a template into its distro logo.
 *
 * Never throws and never produces half-formed markup: an unknown OS, an emoji
 * that was never uploaded, and a Discord API that would not answer all degrade
 * to plain text rather than to `<:vb_undefined:>`.
 */
export interface EmojiResolver {
  /** `<:vb_debian:123>` for embed text, or `""` when nothing matches. */
  forTemplate(template: TemplateLike): string;
  /**
   * The same emoji in the object form components take.
   *
   * Buttons and select options carry `{ id, name }` rather than the markup an
   * embed uses, so a resolver that only produced markup left the operating
   * system picker — the one place a distro logo helps most — without logos.
   */
  componentForTemplate(
    template: TemplateLike,
  ): APIMessageComponentEmoji | undefined;
  /** By manifest name, for the fixed UI emoji. */
  byName(name: string): string;
}

const render = (emoji: Pick<APIEmoji, "id" | "name" | "animated">): string =>
  `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;

/** A resolver that renders nothing. Used when the emoji list is unavailable. */
export const emptyEmojiResolver: EmojiResolver = {
  forTemplate: () => "",
  componentForTemplate: () => undefined,
  byName: () => "",
};

/**
 * Builds a resolver from the application's live emoji list.
 *
 * The list is fetched once per interaction rather than cached across them: the
 * registry rebuilds the context when configuration changes, and an interaction
 * is short enough that one extra GET is cheaper than reasoning about a stale
 * cache that outlives an emoji being re-uploaded.
 *
 * A failure is swallowed — the bot answering without logos beats it not
 * answering.
 */
export const createEmojiResolver = async (
  client: DiscordClient,
  logger?: { warn(message: string, fields?: Record<string, unknown>): void },
): Promise<EmojiResolver> => {
  let live: APIEmoji[];
  try {
    live = await listEmojis(client);
  } catch (error) {
    logger?.warn("[discord] Could not list application emojis", {
      error: error instanceof Error ? error.message : String(error),
    });
    return emptyEmojiResolver;
  }

  const byEmojiName = new Map(
    live
      .filter((emoji): emoji is APIEmoji & { id: string; name: string } =>
        Boolean(emoji.id && emoji.name),
      )
      .map((emoji) => [emoji.name, emoji]),
  );

  const lookup = (name: string): string => {
    const emoji = byEmojiName.get(name);
    return emoji ? render(emoji) : "";
  };

  /** The uploaded emoji matching a template, by name then by icon path. */
  const match = (template: TemplateLike) => {
    if (!template) return undefined;

    const haystack = [template.name, template.icon]
      .filter((value): value is string => typeof value === "string")
      .join(" ");
    if (!haystack) return undefined;

    const descriptor = EMOJI_MANIFEST.find((entry) =>
      entry.match.test(haystack),
    );

    return descriptor ? byEmojiName.get(descriptor.name) : undefined;
  };

  return {
    byName: lookup,
    forTemplate: (template) => {
      const emoji = match(template);
      return emoji ? render(emoji) : "";
    },
    componentForTemplate: (template) => {
      const emoji = match(template);
      return emoji
        ? { id: emoji.id, name: emoji.name, animated: emoji.animated }
        : undefined;
    },
  };
};
