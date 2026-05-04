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
import type { APIModalInteractionResponse } from "discord-api-types/v10";
import {
  ComponentType,
  InteractionResponseType,
  TextInputStyle,
} from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted } from "next-intl/server";

export const ResetServerPasswordModal = async ({
  locale,
  serverId,
}: {
  locale: Locale;
  serverId: string;
}): Promise<APIModalInteractionResponse> => {
  const t = await getExtracted({
    namespace: "discord-integration",
    locale,
  });

  return {
    type: InteractionResponseType.Modal,
    data: {
      title: t("Reset Password"),
      custom_id: `modal:reset-server-password:${serverId}`,
      components: [
        {
          type: ComponentType.TextDisplay,
          content: t(
            "This action will fail if the package `qemu-quest-agent` is not installed.",
          ),
        },
        {
          type: ComponentType.Label,
          label: truncate(t("Username"), 45) as string,
          description: truncate(
            t("Mostly `root` for Linux and `Administrator` for Windows."),
            100,
          ) as string,
          component: {
            type: ComponentType.TextInput,
            custom_id: "input:username",
            style: TextInputStyle.Short,
            min_length: 1,
            max_length: 64,
            required: true,
            placeholder: "root",
            value: "root",
          },
        },
        {
          type: ComponentType.Label,
          label: truncate(t("New Password"), 45) as string,
          description: truncate(
            t(
              "One uppercase letter, one lowercase letter, one number, and 8 characters minimum.",
            ),
            100,
          ) as string,
          component: {
            type: ComponentType.TextInput,
            custom_id: "input:password",
            style: TextInputStyle.Short,
            min_length: 8,
            max_length: 100,
            required: true,
            placeholder: "********",
          },
        },
      ],
    },
  };
};
