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

import { integrations } from "@virtbase/api/integrations";
import { decryptStoredOAuthTokenIfNeeded } from "@virtbase/auth/stored-oauth-token";
import { and, eq, gte, ilike, isNotNull, isNull, or, sql } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { accounts } from "@virtbase/db/schema";
import { env } from "@/env";
import { withCronSecret } from "@/lib/with-cron-secret";

/**
 * Re-pushes linked-account metadata for every integration implementing the
 * `identity` port.
 *
 * The account hook covers linking and token refresh; this catches the case
 * where the underlying data changed — a customer's server count, for instance —
 * without any auth event to trigger a push.
 *
 * No longer Discord-specific: which providers exist, and whether they are
 * enabled at all, is the registry's business.
 */
const handler = withCronSecret(async () => {
  console.log(
    "[CRON] Starting sync of linked account metadata. Current time is:",
    new Date().toISOString(),
  );

  const authSecret = env.BETTER_AUTH_SECRET;
  if (!authSecret) {
    return new Response("BETTER_AUTH_SECRET is not configured", {
      status: 500,
    });
  }

  const providers = await integrations.resolveAll("identity");
  if (0 === providers.length) {
    console.warn("[CRON] No identity providers are enabled, skipping sync");
    return new Response("OK", { status: 200 });
  }

  for (const provider of providers) {
    const items = await db.transaction(
      async (tx) => {
        return tx
          .select({
            userId: accounts.userId,
            accountId: accounts.accountId,
            scope: accounts.scope,
            accessToken: accounts.accessToken,
          })
          .from(accounts)
          .where(
            and(
              eq(accounts.providerId, provider.providerId),
              isNotNull(accounts.scope),
              isNotNull(accounts.accessToken),
              or(
                isNull(accounts.accessTokenExpiresAt),
                gte(accounts.accessTokenExpiresAt, sql`now()`),
              ),
              // Accounts linked before a scope was requested still exist
              // without it, and the provider API rejects those pushes.
              ...(provider.requiredScopes ?? []).map((scope) =>
                ilike(accounts.scope, `%${scope}%`),
              ),
            ),
          );
      },
      {
        accessMode: "read only",
        isolationLevel: "read committed",
      },
    );

    console.log(
      `[CRON] Found ${items.length} ${provider.providerId} accounts to sync.`,
    );

    await Promise.all(
      items.map(async ({ userId, accountId, scope, accessToken }) => {
        const plain = await decryptStoredOAuthTokenIfNeeded(
          accessToken as string,
          authSecret,
        );

        return provider.onAccountLinked({
          userId,
          providerId: provider.providerId,
          accountId,
          scopes: scope?.split(",").map((entry) => entry.trim()) ?? [],
          accessToken: plain,
        });
      }),
    );
  }

  return new Response("OK", {
    status: 200,
  });
});

export { handler as GET };
