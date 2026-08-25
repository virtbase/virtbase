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

import type { IntegrationLogger } from "@virtbase/integration-sdk";
import type { ServerManagementPort } from "@virtbase/ports";
import type {
  APIInteraction,
  APIInteractionResponse,
} from "discord-api-types/v10";
import type { Locale } from "next-intl";

import type { DiscordClient } from "../api";
import type { EmojiResolver } from "../emoji";
import type { UserByInteraction } from "../utils/get-user-by-interaction";

/**
 * Acknowledges the interaction now and edits the message when `work` resolves.
 *
 * Discord closes an interaction that is not answered within three seconds, and
 * almost nothing behind this bot answers that fast — a power action, a backup
 * listing and a firewall read all reach the hypervisor. Handlers that touch a
 * server call this instead of returning a message directly.
 *
 * `work` returns an ordinary {@link APIInteractionResponse}, so every message
 * builder in this package is usable in both modes without a second variant.
 */
export type Deferred = (
  work: () => Promise<APIInteractionResponse>,
  options?: {
    /** Replace the message the component sits on, rather than posting a new one. */
    update?: boolean;
  },
) => APIInteractionResponse;

/**
 * Everything a handler is allowed to reach.
 *
 * `servers` is an interface from `@virtbase/ports`, which is what lets these
 * handlers be tested without booting the API. The rest is what the integration
 * context supplied — notably `appId`, which used to be read from
 * `process.env.DISCORD_APP_ID` at module scope and is now configuration like
 * any other.
 */
export interface InteractionContext<T extends APIInteraction = APIInteraction> {
  interaction: T;
  user: UserByInteraction | null;
  /** Resolved once from `interaction.locale`, so handlers never map it again. */
  locale: Locale;
  servers: ServerManagementPort;
  discord: DiscordClient;
  emojis: EmojiResolver;
  logger: IntegrationLogger;
  appId: string;
  deferred: Deferred;
  /**
   * Positional arguments decoded from the component's `custom_id`.
   *
   * The router puts them here so a handler never splits a custom id itself —
   * that parsing lived in six places and each one had its own idea of which
   * index held the server id.
   */
  params: string[];
}

/**
 * A context whose Virtbase account is known to be linked.
 *
 * The router refuses a component whose handler needs an account before that
 * handler runs, which is what lets everything downstream read `ctx.user`
 * without a null check and without a second "please link your account"
 * message per feature.
 */
export interface LinkedInteractionContext<
  T extends APIInteraction = APIInteraction,
> extends InteractionContext<T> {
  user: UserByInteraction;
}

export type LinkedHandler<T extends APIInteraction = APIInteraction> = (
  ctx: LinkedInteractionContext<T>,
) => APIInteractionResponse | Promise<APIInteractionResponse>;

export type InteractionHandler<T extends APIInteraction = APIInteraction> = (
  ctx: InteractionContext<T>,
) => APIInteractionResponse | Promise<APIInteractionResponse>;

/** Narrows a handler's context to a more specific interaction type. */
export const narrow = <T extends APIInteraction>(
  ctx: InteractionContext,
): InteractionContext<T> => ctx as InteractionContext<T>;
