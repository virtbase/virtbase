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

import { captureException } from "@sentry/core";
import type { GenericEndpointContext } from "better-auth";
import { decryptOAuthToken } from "better-auth/oauth2";
import type { Account } from "better-auth/types";

/**
 * A social account that was just linked, or whose token was just refreshed.
 *
 * Structurally identical to `LinkedAccount` in `@virtbase/ports`, and
 * deliberately redeclared: the auth package sits below the ports layer, so it
 * describes what it emits rather than importing an interface from above. The
 * composition root maps one onto the other.
 */
export interface LinkedAccountInfo {
  userId: string;
  providerId: string;
  accountId: string;
  scopes: string[];
  accessToken: string | null;
}

export type AccountLinkedHandler = (
  account: LinkedAccountInfo,
) => Promise<void>;

/**
 * Decrypts the stored OAuth token and hands the account to the injected
 * handler.
 *
 * This used to call into Discord directly. It now knows nothing about any
 * provider: what to do with a linked account is the composition root's
 * decision, dispatched to whichever integrations implement the `identity` port.
 *
 * Failures are captured and swallowed — a downstream integration erroring must
 * never fail the login that triggered it.
 */
export const notifyAccountLinked = async (
  account: Account & Record<string, unknown>,
  ctx: GenericEndpointContext | null,
  handler: AccountLinkedHandler | undefined,
): Promise<void> => {
  if (!handler || !ctx) return;

  try {
    const accessToken = account.accessToken
      ? await decryptOAuthToken(account.accessToken, ctx.context)
      : null;

    await handler({
      userId: String(account.userId),
      providerId: account.providerId,
      accountId: String(account.accountId),
      scopes: account.scope?.split(",").map((scope) => scope.trim()) ?? [],
      accessToken,
    });
  } catch (error) {
    captureException(error);

    console.error(`[@virtbase/auth] Account linked handler failed: ${error}`);
  }
};
