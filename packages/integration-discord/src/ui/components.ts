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

import { truncate } from "@virtbase/utils";
import type {
  APIActionRowComponent,
  APIButtonComponentWithCustomId,
  APIButtonComponentWithURL,
  APIComponentInMessageActionRow,
  APIMessageComponentEmoji,
  APIStringSelectComponent,
} from "discord-api-types/v10";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";

import { encodeCustomId } from "../routing";

/** Discord's own caps. Exceeding one drops the whole message, silently. */
const LABEL_MAX = 80;
const PLACEHOLDER_MAX = 150;
const OPTION_LABEL_MAX = 100;
const OPTION_DESCRIPTION_MAX = 100;
const URL_MAX = 512;
export const SELECT_OPTIONS_MAX = 25;

/**
 * Trims and truncates a label, falling back when there is nothing left.
 *
 * A message with an empty label on any component is rejected whole
 * (`BASE_TYPE_BAD_LENGTH`), and the customer is told the bot did not respond.
 * The way that happens in practice is a string that has not been translated
 * yet: next-intl returns "" for a missing translation, so a screen that works
 * in English takes itself down in German. A fallback is worse text and a
 * working screen, which is the right trade.
 */
const safeLabel = (value: string, fallback: string, max: number): string => {
  const trimmed = value.trim();
  const chosen = trimmed.length > 0 ? trimmed : fallback.trim();

  return (truncate(chosen, max) as string) || "…";
};

/**
 * A unicode glyph, or an uploaded emoji in the object form Discord wants.
 *
 * Unicode covers the fixed chrome — arrows, a refresh symbol — and renders
 * before the emoji sync has ever run. The object form is for the distro logos.
 */
export type ComponentEmoji = string | APIMessageComponentEmoji;

const toEmoji = (
  emoji: ComponentEmoji | undefined,
): { emoji: APIMessageComponentEmoji } | Record<string, never> =>
  emoji === undefined
    ? {}
    : { emoji: typeof emoji === "string" ? { name: emoji } : emoji };

/**
 * A button that comes back to this bot.
 *
 * Labels arrive already translated: every caller is a message builder that
 * holds a translator, and next-intl only extracts literals written at a
 * `getExtracted` call site — so the strings have to live there, not here.
 */
export const actionButton = ({
  feature,
  action,
  params,
  label,
  style = ButtonStyle.Secondary,
  emoji,
  disabled,
}: {
  feature: string;
  action: string;
  params?: string[];
  label: string;
  style?: Exclude<ButtonStyle, ButtonStyle.Link | ButtonStyle.Premium>;
  emoji?: ComponentEmoji;
  disabled?: boolean;
}): APIButtonComponentWithCustomId => ({
  type: ComponentType.Button,
  style,
  // Falls back to the route it triggers: unhelpful, but a button a customer can
  // press beats a screen that never arrives.
  label: safeLabel(label, action, LABEL_MAX),
  custom_id: encodeCustomId({ kind: "button", feature, action, params }),
  ...toEmoji(emoji),
  ...(disabled ? { disabled } : {}),
});

/**
 * Whether Discord will accept this as a link button's destination.
 *
 * Discord validates the URL and rejects the *entire message* if it does not
 * like one, which surfaces to the customer as "did not respond in time" — the
 * reply was sent, and thrown away. A `.localhost` host is the case that matters
 * in practice: `APP_DOMAIN` is `http://app.virtbase.localhost:3000` in
 * development, so every portal button would take its whole screen down with it.
 */
export const isLinkableUrl = (url: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const host = parsed.hostname;
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "127.0.0.1" || host === "::1" || host === "[::1]") return false;
  // A host with no dot is a bare name only resolvable on someone's own network.
  if (!host.includes(".")) return false;

  return url.length <= URL_MAX;
};

/**
 * A button that navigates away. Carries no custom id and never comes back.
 *
 * Returns `undefined` for a URL Discord would reject, and {@link row} drops it:
 * losing one button is a great deal better than losing the message it was on.
 * Locally this means portal links are simply absent, because they point at
 * `.localhost` — see the README.
 */
export const linkButton = ({
  url,
  label,
  emoji,
}: {
  url: string;
  label: string;
  emoji?: ComponentEmoji;
}): APIButtonComponentWithURL | undefined =>
  isLinkableUrl(url)
    ? {
        type: ComponentType.Button,
        style: ButtonStyle.Link,
        url,
        label: safeLabel(label, new URL(url).hostname, LABEL_MAX),
        ...toEmoji(emoji),
      }
    : undefined;

export const select = ({
  feature,
  action,
  params,
  placeholder,
  options,
}: {
  feature: string;
  action: string;
  params?: string[];
  placeholder: string;
  options: {
    label: string;
    value: string;
    description?: string;
    emoji?: ComponentEmoji;
  }[];
}): APIStringSelectComponent => ({
  type: ComponentType.StringSelect,
  custom_id: encodeCustomId({ kind: "select", feature, action, params }),
  ...(placeholder.trim()
    ? { placeholder: truncate(placeholder, PLACEHOLDER_MAX) as string }
    : {}),
  min_values: 1,
  max_values: 1,
  // Discord renders at most 25 options and rejects a menu with more.
  options: options.slice(0, SELECT_OPTIONS_MAX).map((option) => ({
    label: safeLabel(option.label, option.value, OPTION_LABEL_MAX),
    value: option.value,
    ...(option.description
      ? {
          description: truncate(
            option.description,
            OPTION_DESCRIPTION_MAX,
          ) as string,
        }
      : {}),
    ...toEmoji(option.emoji),
  })),
});

/**
 * A row of components. Discord allows five rows per message and five buttons
 * per row; a select menu takes a row to itself.
 */
export const row = (
  ...components: (APIComponentInMessageActionRow | false | null | undefined)[]
): APIActionRowComponent<APIComponentInMessageActionRow> => ({
  type: ComponentType.ActionRow,
  components: components.filter(
    (component): component is APIComponentInMessageActionRow =>
      Boolean(component),
  ),
});
