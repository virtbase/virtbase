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
import { pushDiscordLinkedRoleMetadata } from "./push-discord-linked-role-metadata";

export const syncDiscordLinkedRoleMetadata = async (
  account: Account & Record<string, unknown>,
  ctx: GenericEndpointContext | null,
) => {
  if (account.providerId !== "discord") return;
  if (!account.scope?.includes("role_connections.write")) return;

  const stored = account.accessToken;
  if (!stored || !ctx) return;

  try {
    const accessToken = await decryptOAuthToken(stored, ctx.context);
    await pushDiscordLinkedRoleMetadata({
      userId: String(account.userId),
      accessToken,
    });
  } catch (error) {
    captureException(error);

    console.error(
      `[@virtbase/auth] Failed to push Discord linked role metadata: ${error}`,
    );
  }
};
