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

import type { LocalizedIntegrationText } from "@virtbase/integration-sdk";
import { getExtracted } from "next-intl/server";

/**
 * Admin console text for this integration.
 *
 * The literals live here, rather than being passed a translator, because
 * next-intl extracts from `getExtracted` call sites — a `t` received as an
 * argument is invisible to it.
 */
export const localizeDiscord = async (): Promise<LocalizedIntegrationText> => {
  const t = await getExtracted();

  return {
    name: t("Discord"),
    description: t(
      "Server management from Discord, and account linking via Discord.",
    ),
    fields: {
      appId: {
        label: t("Application ID"),
        help: t(
          "Found under General Information in the Discord developer portal.",
        ),
      },
      botToken: { label: t("Bot token") },
      publicKey: {
        label: t("Public key"),
        help: t(
          "Used to verify that interaction requests really came from Discord.",
        ),
      },
    },
  };
};
