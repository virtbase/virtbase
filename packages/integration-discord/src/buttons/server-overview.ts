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

import type { APIButtonComponentWithCustomId } from "discord-api-types/v10";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted } from "next-intl/server";

export const ServerOverviewButton = async ({
  locale,
  serverId,
  ...overrides
}: {
  locale: Locale;
  serverId: string;
  overrides?: Omit<
    Partial<APIButtonComponentWithCustomId>,
    "type" | "custom_id"
  >;
}): Promise<APIButtonComponentWithCustomId> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  return {
    type: ComponentType.Button,
    style: ButtonStyle.Secondary,
    label: t("Back to server"),
    custom_id: `button:server-overview:${serverId}`,
    ...overrides,
  };
};
