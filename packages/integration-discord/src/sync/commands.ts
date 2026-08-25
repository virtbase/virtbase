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

import { listCommands, putCommands } from "../api";
import { commands } from "../commands";
import { canonical } from "./canonical";
import type { Reconciler } from "./types";

/** Fields Discord accepts on a command; everything else it adds itself. */
const COMPARED = [
  "name",
  "name_localizations",
  "description",
  "description_localizations",
  "type",
  "options",
] as const;

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/**
 * Registers the slash commands, and only when they differ from what is live.
 *
 * This replaced a hand-run script that read `DISCORD_APP_ID` and
 * `DISCORD_BOT_TOKEN` from the environment. Registration is now a consequence
 * of the integration being enabled and healthy, which means a fresh deployment
 * cannot forget it and a hand-edit in the developer portal does not survive.
 */
export const reconcileCommands: Reconciler = async (client) => {
  const desired = Object.values(commands).slice().sort(byName);
  const live = (await listCommands(client)).slice().sort(byName);

  if (canonical(desired, COMPARED) === canonical(live, COMPARED)) {
    return { name: "commands", changed: false };
  }

  await putCommands(client, desired);

  return {
    name: "commands",
    changed: true,
    detail: `registered ${desired.length} command(s)`,
  };
};
