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

import { routeKey } from "../routing";
import { backupsFeature } from "./backups";
import { firewallFeature } from "./firewall";
import { lifecycleFeature } from "./lifecycle";
import { menuFeature } from "./menu";
import { powerFeature } from "./power";
import { rdnsFeature } from "./rdns";
import { serversFeature } from "./servers";
import { statsFeature } from "./stats";
import type { DiscordFeature, Entry, ResolvedEntry } from "./types";
import { resolveEntry } from "./types";

export * from "./types";

/**
 * Everything the bot can do. Adding a capability is adding a line here and a
 * directory next to the others — no dispatcher is edited, because the routing
 * tables below are derived rather than written.
 */
export const FEATURES: DiscordFeature[] = [
  menuFeature,
  serversFeature,
  powerFeature,
  statsFeature,
  backupsFeature,
  firewallFeature,
  rdnsFeature,
  lifecycleFeature,
];

const tableOf = <T extends APIInteraction>(
  pick: (feature: DiscordFeature) => Record<string, Entry<T>> | undefined,
): Map<string, ResolvedEntry<T>> => {
  const table = new Map<string, ResolvedEntry<T>>();

  for (const feature of FEATURES) {
    for (const [action, entry] of Object.entries(pick(feature) ?? {})) {
      const key = routeKey({ feature: feature.id, action });

      if (table.has(key)) {
        // Two features claiming one route would make which handler runs depend
        // on registration order. Failing at import is the only moment anyone
        // would notice.
        throw new Error(
          `[@virtbase/discord] Duplicate handler registered for "${key}"`,
        );
      }

      table.set(key, resolveEntry(entry));
    }
  }

  return table;
};

export const buttonHandlers = tableOf<APIMessageComponentButtonInteraction>(
  (feature) => feature.buttons,
);

export const selectHandlers = tableOf<APIMessageComponentSelectMenuInteraction>(
  (feature) => feature.selects,
);

export const modalHandlers = tableOf<APIModalSubmitInteraction>(
  (feature) => feature.modals,
);

/**
 * Slash commands are keyed by name alone: Discord's global command namespace is
 * flat, so `/menu` cannot be scoped to a feature the way a component's custom
 * id can.
 */
export const commandHandlers = ((): Map<
  string,
  ResolvedEntry<APIApplicationCommandInteraction>
> => {
  const table = new Map<
    string,
    ResolvedEntry<APIApplicationCommandInteraction>
  >();

  for (const feature of FEATURES) {
    for (const [name, entry] of Object.entries(feature.commands ?? {})) {
      if (table.has(name)) {
        throw new Error(
          `[@virtbase/discord] Duplicate handler registered for command "${name}"`,
        );
      }

      table.set(name, resolveEntry(entry));
    }
  }

  return table;
})();
