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

import type { APIEmbed } from "discord-api-types/v10";
import { EmbedType } from "discord-api-types/v10";
import { getExtracted } from "next-intl/server";

export const createEmbed = async ({
  locale,
  ...props
}: APIEmbed & { locale: string }): Promise<APIEmbed> => {
  const t = await getExtracted({
    locale,
    namespace: "discord-integration",
  });

  return {
    color: 0xffffff,
    footer: {
      text: t("Virtbase - Hosting, but secure."),
      icon_url: `https://virtbase.com/web-app-manifest-192x192.png`,
    },
    timestamp: new Date().toISOString(),
    type: EmbedType.Rich,
    ...props,
  };
};
