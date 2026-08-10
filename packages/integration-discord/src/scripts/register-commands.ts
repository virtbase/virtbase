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

/**
 * Registers commands for your Discord bot.
 *
 * This file is meant to be run from the command line, and is not used by the
 * application server. It only needs to be run once.
 * Requires Node 18+ for built-in fetch, otherwise you need to polyfill fetch.
 *
 * ===== Usage =====
 * Run `bun run discord:register-commands` from the root of the repository.
 *
 * @see https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
 */

import { commands } from "../commands";

/**
 * Register all commands globally.  This can take o(minutes), so wait until
 * you're sure these are the commands you want.
 *
 * @see https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
 */
async function main() {
  const { DISCORD_APP_ID, DISCORD_BOT_TOKEN } = process.env;
  if (!DISCORD_APP_ID || !DISCORD_BOT_TOKEN) {
    console.warn(
      "[@virtbase/discord] DISCORD_APP_ID or DISCORD_BOT_TOKEN is not set, skipping command registration",
    );
    return;
  }

  const url = `https://discord.com/api/v10/applications/${DISCORD_APP_ID}/commands`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
    method: "PUT",
    body: JSON.stringify(Object.values(commands)),
  });

  if (response.ok) {
    const data = await response.json();
    console.log(
      "[@virtbase/discord] Successfully registered all commands:",
      JSON.stringify(data, null, 2),
    );
  } else {
    let errorText = `[@virtbase/discord] Error registering commands \n ${response.url}: ${response.status} ${response.statusText}`;
    try {
      const error = await response.text();
      if (error) {
        errorText = `${errorText} \n\n ${error}`;
      }
    } catch (err) {
      console.error(
        "[@virtbase/discord] Error reading body from request:",
        err,
      );
    }
    console.error(errorText);
  }
}

void main();
