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

import { pushDiscordLinkedRoleMetadata } from "@virtbase/auth/push-discord-linked-role-metadata";
import { decryptStoredOAuthTokenIfNeeded } from "@virtbase/auth/stored-oauth-token";
import { and, eq, gte, ilike, isNotNull, isNull, or, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { accounts } from "@virtbase/db/schema";
import type { NextRequest } from "next/server";

/**
 * Syncs the Discord linked role metadata for all users.
 */
async function handler(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  console.log(
    "[CRON] Starting sync of Discord linked role metadata. Current time is:",
    new Date().toISOString(),
  );

  const authSecret = process.env.BETTER_AUTH_SECRET;
  if (!authSecret) {
    return new Response("BETTER_AUTH_SECRET is not configured", {
      status: 500,
    });
  }

  if (!process.env.DISCORD_APP_ID) {
    console.warn(
      "[CRON] DISCORD_APP_ID is not set, skipping sync of Discord linked role metadata",
    );
    return new Response("OK", { status: 200 });
  }

  const items = await db.transaction(
    async (tx) => {
      return tx
        .select({
          userId: accounts.userId,
          accessToken: accounts.accessToken,
        })
        .from(accounts)
        .where(
          and(
            eq(accounts.providerId, "discord"),
            isNotNull(accounts.scope),
            isNotNull(accounts.accessToken),
            or(
              isNull(accounts.accessTokenExpiresAt),
              gte(accounts.accessTokenExpiresAt, sql`now()`),
            ),
            ilike(accounts.scope, "%role_connections.write%"),
          ),
        );
    },
    {
      accessMode: "read only",
      isolationLevel: "read committed",
    },
  );

  console.log(
    "[CRON] Found",
    items.length,
    "accounts to sync Discord linked role metadata for.",
  );

  await Promise.all(
    items.map(async ({ userId, accessToken }) => {
      const plain = await decryptStoredOAuthTokenIfNeeded(
        accessToken as string,
        authSecret,
      );
      return pushDiscordLinkedRoleMetadata({ userId, accessToken: plain });
    }),
  );

  return new Response("OK", {
    status: 200,
  });
}

export { handler as GET };
