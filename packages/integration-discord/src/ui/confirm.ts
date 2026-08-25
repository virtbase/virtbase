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

import { ButtonStyle, InteractionResponseType } from "discord-api-types/v10";
import type { Locale } from "next-intl";
import { getExtracted } from "next-intl/server";
import { createEmbed } from "../utils/create-embed";
import { actionButton, row } from "./components";
import { EMOJI } from "./emoji";
import type { MessageResponse, ResponseType } from "./message";
import { message } from "./message";

/**
 * The screen that stands between a customer and something irreversible.
 *
 * Restoring a backup overwrites a disk, reinstalling destroys one, and a hard
 * stop is a power cut. A Discord button is one click with no undo and no
 * address bar to close, so each of those gets an explicit second click on a
 * screen that names the server and says what will happen.
 *
 * The confirm button carries the real action; cancel goes back where it came
 * from, so a customer who hesitates is never stranded.
 */
export const ConfirmMessage = async ({
  locale,
  type = InteractionResponseType.UpdateMessage,
  title,
  description,
  confirmLabel,
  confirm,
  cancel,
  danger = true,
}: {
  locale: Locale;
  type?: ResponseType;
  title: string;
  description: string;
  confirmLabel: string;
  confirm: { feature: string; action: string; params?: string[] };
  cancel: { feature: string; action: string; params?: string[] };
  /** Red rather than amber. The default, because most confirms guard data loss. */
  danger?: boolean;
}): Promise<MessageResponse> => {
  const t = await getExtracted({ namespace: "discord-integration", locale });

  return message({
    type,
    embeds: [
      await createEmbed({
        locale,
        title: `⚠️ ${title}`,
        description,
        color: danger ? 0xef4444 : 0xf59e0b,
      }),
    ],
    components: [
      row(
        actionButton({
          ...confirm,
          label: confirmLabel,
          style: danger ? ButtonStyle.Danger : ButtonStyle.Primary,
        }),
        actionButton({ ...cancel, label: t("Cancel"), emoji: EMOJI.cancel }),
      ),
    ],
  });
};
