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

import type {
  APIInteraction,
  APIInteractionResponse,
} from "discord-api-types/v10";
import { InteractionResponseType } from "discord-api-types/v10";

import type { ResolvedEntry } from "../features";
import { MainMenuMessage, SetupMenuMessage } from "../features/menu";
import type { ComponentKind } from "../routing";
import { decodeCustomId, routeKey } from "../routing";
import type { InteractionContext } from "./types";

/**
 * Runs one handler from a routing table.
 *
 * The two checks here are the ones that must not be per-feature: an entry that
 * no longer exists, and an account that is not linked. Every feature handler is
 * written on the assumption that both have already passed, which is what keeps
 * "please link your account" from being re-implemented seven times.
 */
export const runComponent = async <T extends APIInteraction>(
  ctx: InteractionContext,
  kind: ComponentKind,
  customId: string,
  table: Map<string, ResolvedEntry<T>>,
): Promise<APIInteractionResponse> => {
  const decoded = decodeCustomId(customId, kind);
  const entry = decoded ? table.get(routeKey(decoded)) : undefined;

  // A component from a message sent before a deploy that renamed its route. The
  // customer clicked something that is simply gone, so the honest answer is the
  // menu rather than an error about a custom id they cannot see.
  if (!decoded || !entry) {
    ctx.logger.warn("[discord] No handler for component", { customId });

    return ctx.user
      ? MainMenuMessage({
          locale: ctx.locale,
          type: InteractionResponseType.UpdateMessage,
        })
      : SetupMenuMessage({
          locale: ctx.locale,
          type: InteractionResponseType.UpdateMessage,
        });
  }

  if (!entry.allowUnlinked && !ctx.user) {
    return SetupMenuMessage({
      locale: ctx.locale,
      type: InteractionResponseType.UpdateMessage,
    });
  }

  return entry.handle({
    ...ctx,
    params: decoded.params,
  } as InteractionContext<T>);
};
