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

import * as Sentry from "@sentry/node";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { accounts } from "@virtbase/db/schema";

/** Where each provider accepts a token revocation, and what it calls itself. */
const REVOCATION_ENDPOINTS: Record<string, string> = {
  discord: "https://discord.com/api/v10/oauth2/token/revoke",
  google: "https://oauth2.googleapis.com/revoke",
  github: "https://api.github.com/applications",
};

type RevokeExternalIdentitiesStepParams = {
  userId: string;
};

/**
 * Hands back the OAuth grants the customer gave us.
 *
 * Deleting the `accounts` rows on its own would only make us forget the
 * tokens - the grant would still be live at the provider, and still listed
 * under "apps with access to your account" for someone who has just asked to
 * be forgotten. Revoking is the part that is visible to them.
 *
 * Best effort by design: a provider that is down, or a token that already
 * expired, must not stop the erasure. Every failure is reported and the run
 * continues.
 */
export async function revokeExternalIdentitiesStep({
  userId,
}: RevokeExternalIdentitiesStepParams) {
  "use step";

  const linked = await db
    .select({
      id: accounts.id,
      providerId: accounts.providerId,
      accessToken: accounts.accessToken,
    })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  let revoked = 0;

  for (const account of linked) {
    const endpoint = REVOCATION_ENDPOINTS[account.providerId];
    if (!endpoint || !account.accessToken) continue;

    try {
      // Tokens are stored encrypted; the decryption helper lives in the auth
      // layer because unwrapping needs Better Auth internals.
      const { decryptStoredOAuthTokenIfNeeded } = await import(
        "@virtbase/auth/stored-oauth-token"
      );
      const secret = process.env.BETTER_AUTH_SECRET;
      if (!secret) break;

      const token = await decryptStoredOAuthTokenIfNeeded(
        account.accessToken,
        secret,
      );

      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });

      revoked++;
    } catch (error) {
      Sentry.captureException(error);
    }
  }

  return { revoked };
}
