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
  APIApplicationCommandInteraction,
  APIInteraction,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIModalSubmitInteraction,
} from "discord-api-types/v10";

import type { InteractionHandler, LinkedHandler } from "../handlers/types";

/**
 * A handler that needs no linked Virtbase account.
 *
 * Wrapping is deliberately the exception: almost everything this bot does acts
 * on somebody's servers, so requiring an account is the default and opting out
 * of it is visible at the registration site.
 */
export interface UnlinkedEntry<T extends APIInteraction> {
  readonly allowUnlinked: true;
  readonly handle: InteractionHandler<T>;
}

export const unlinked = <T extends APIInteraction>(
  handle: InteractionHandler<T>,
): UnlinkedEntry<T> => ({ allowUnlinked: true, handle });

/** A bare function requires a linked account; `unlinked()` opts out. */
export type Entry<T extends APIInteraction> =
  | LinkedHandler<T>
  | UnlinkedEntry<T>;

/**
 * One coherent slice of what the bot can do.
 *
 * Keys are the `action` half of a `custom_id`; the feature's `id` is the other
 * half, so `{ id: "backups", buttons: { restore } }` answers
 * `button:backups:restore:<params>`. Nothing else has to be registered — the
 * composition in `features/index.ts` derives the routing tables from these.
 */
export interface DiscordFeature {
  id: string;
  /** Keyed by slash command name. */
  commands?: Record<string, Entry<APIApplicationCommandInteraction>>;
  buttons?: Record<string, Entry<APIMessageComponentButtonInteraction>>;
  selects?: Record<string, Entry<APIMessageComponentSelectMenuInteraction>>;
  modals?: Record<string, Entry<APIModalSubmitInteraction>>;
}

/** Normalized form the router looks up. */
export interface ResolvedEntry<T extends APIInteraction> {
  allowUnlinked: boolean;
  handle: InteractionHandler<T>;
}

export const resolveEntry = <T extends APIInteraction>(
  entry: Entry<T>,
): ResolvedEntry<T> =>
  typeof entry === "function"
    ? { allowUnlinked: false, handle: entry as InteractionHandler<T> }
    : { allowUnlinked: true, handle: entry.handle };
