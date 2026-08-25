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

import { InteractionResponseType } from "discord-api-types/v10";

import type { DiscordFeature } from "../types";
import { unlinked } from "../types";
import {
  HelpMessage,
  InviteMessage,
  MainMenuMessage,
  SetupMenuMessage,
} from "./messages";

export * from "./messages";

/**
 * The hub, and everything reachable without an account.
 *
 * `/menu` is the one command that branches on whether the account is linked:
 * it is the entry point, so answering it with the setup guide is more useful
 * than refusing it.
 */
export const menuFeature: DiscordFeature = {
  id: "menu",

  commands: {
    menu: unlinked(({ locale, user }) =>
      user ? MainMenuMessage({ locale }) : SetupMenuMessage({ locale }),
    ),
    invite: unlinked(({ locale, appId }) => InviteMessage({ locale, appId })),
    help: unlinked(({ locale, appId }) => HelpMessage({ locale, appId })),
  },

  buttons: {
    home: ({ locale }) =>
      MainMenuMessage({
        locale,
        type: InteractionResponseType.UpdateMessage,
      }),
    help: unlinked(({ locale, appId }) =>
      HelpMessage({
        locale,
        appId,
        type: InteractionResponseType.UpdateMessage,
      }),
    ),
  },
};
