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

import { and, eq, gte, isNull, or, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { servers } from "@virtbase/db/schema";

// Must match the schema defined in src/role-connections-metadata.ts
interface Metadata {
  active_servers_count: number;
}

/**
 * Given metadata that matches the schema, push that data to Discord on behalf
 * of the current user.
 */
export const pushDiscordLinkedRoleMetadata = async ({
  userId,
  accessToken,
}: {
  userId: string;
  accessToken: string;
}) => {
  const { DISCORD_APP_ID } = process.env;
  if (!DISCORD_APP_ID) {
    return console.warn(
      "[@virtbase/discord] DISCORD_APP_ID is not set, skipping metadata push",
    );
  }

  const metadata = await db.transaction(async (tx) => {
    const activeServersCount = await tx.$count(
      servers,
      and(
        eq(servers.userId, userId),
        or(isNull(servers.terminatesAt), gte(servers.terminatesAt, sql`now()`)),
      ),
    );

    return {
      active_servers_count: activeServersCount,
    } satisfies Metadata;
  });

  const url = `https://discord.com/api/v10/users/@me/applications/${DISCORD_APP_ID}/role-connection`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    method: "PUT",
    body: JSON.stringify({
      metadata,
    }),
  });
  if (!response.ok) {
    let errorText = `[@virtbase/discord] Error sending metadata \n ${response.url}: ${response.status} ${response.statusText}`;
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
};
