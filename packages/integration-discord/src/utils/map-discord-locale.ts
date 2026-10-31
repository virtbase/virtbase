/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { Locale as DiscordLocale } from "discord-api-types/v10";
import type { Locale } from "next-intl";

const defaultLocale = "en" satisfies Locale;

/** Discord `Locale` string → Virtbase `*.po` basename (only where both exist). */
const discordLocaleMapping: Partial<Record<DiscordLocale, Locale>> = {
  de: "de",
  "en-GB": "en",
  "en-US": "en",
  fr: "fr",
  nl: "nl",
};

/**
 * Maps a Discord locale to a supported next-intl locale.
 * If the locale is not supported, the default locale is returned.
 */
export const mapDiscordLocale = (locale: DiscordLocale): Locale => {
  return discordLocaleMapping[locale] ?? defaultLocale;
};
